import { useEffect, useRef } from 'react'
import type { FaceLandmarker, HandLandmarker } from '@mediapipe/tasks-vision'
import { WebcamGate } from '@/shared/components/WebcamGate'
import { SoundToggle } from '@/shared/components/SoundToggle'
import type { ExperimentProps } from '@/shared/types'
import { useAnimationLoop } from '@/shared/hooks/useAnimationLoop'
import { useCanvas2D } from '@/shared/hooks/useCanvas2D'
import { useGlassAudio } from '@/shared/hooks/useGlassAudio'
import { GLASS_SCALE } from '@/shared/lib/glassAudio'
import { createFaceLandmarker, createHandLandmarker } from '@/shared/lib/mediapipe'
import { dist, mirroredPoint, type Point } from '../_shared/asciiTools'

const CELL = 9 // screen px per fog cell — smaller = sharper wipe, heavier
const CONDENSE = 0.05 // ambient fog regrow per second (whole pane)
const WIPE_R = 46 // fingertip wipe radius (screen px)
const BREATH_R = 150 // breath plume radius near the mouth
const MAX_DRIPS = 90
const DETECT_MS = 33

const FOG_TINT: [number, number, number] = [214, 226, 234] // cool frosted white

interface Drip {
  gx: number // fog-grid column it slides down
  y: number // screen y
  vy: number
  r: number // clear radius
  life: number
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}

function Scene({ video, paused }: { video: HTMLVideoElement } & ExperimentProps) {
  const { canvasRef, ctxRef, sizeRef } = useCanvas2D()
  const videoRef = useRef<HTMLVideoElement>(null)
  const handRef = useRef<HandLandmarker | null>(null)
  const faceRef = useRef<FaceLandmarker | null>(null)
  const lastDetect = useRef(0)

  // condensation field (row-major, gw x gh), 1 = fully fogged
  const fog = useRef<{ data: Float32Array; frost: Float32Array; gw: number; gh: number }>({
    data: new Float32Array(0),
    frost: new Float32Array(0),
    gw: 0,
    gh: 0,
  })
  const fogCanvas = useRef<HTMLCanvasElement | null>(null)
  const fogImage = useRef<ImageData | null>(null)

  const tipsRef = useRef<Point[]>([])
  const prevTipsRef = useRef<(Point | null)[]>([null, null])
  const breathRef = useRef<{ x: number; y: number; open: number } | null>(null)
  const dripsRef = useRef<Drip[]>([])
  const lastBellRef = useRef(0)

  const { audioRef, muted, toggleMuted } = useGlassAudio(paused, 0.5)

  useEffect(() => {
    const el = videoRef.current
    if (el) {
      el.srcObject = video.srcObject
      void el.play().catch(() => {})
    }
  }, [video])

  useEffect(() => {
    let alive = true
    void Promise.all([createHandLandmarker(2), createFaceLandmarker()]).then(([hand, face]) => {
      if (alive) {
        handRef.current = hand
        faceRef.current = face
      } else {
        hand.close()
        face.close()
      }
    })
    return () => {
      alive = false
      handRef.current?.close()
      faceRef.current?.close()
      handRef.current = null
      faceRef.current = null
    }
  }, [])

  useAnimationLoop((_elapsed, delta) => {
    const ctx = ctxRef.current
    if (!ctx) return
    const { width, height } = sizeRef.current
    if (!width || !height) return
    const now = performance.now()
    const audio = audioRef.current

    // (re)allocate the fog grid on resize
    const gw = Math.max(1, Math.ceil(width / CELL))
    const gh = Math.max(1, Math.ceil(height / CELL))
    const f = fog.current
    if (f.gw !== gw || f.gh !== gh) {
      f.gw = gw
      f.gh = gh
      f.data = new Float32Array(gw * gh).fill(0.9)
      f.frost = new Float32Array(gw * gh)
      for (let i = 0; i < f.frost.length; i++) f.frost[i] = 0.82 + Math.random() * 0.18
      let fc = fogCanvas.current
      if (!fc) fc = fogCanvas.current = document.createElement('canvas')
      fc.width = gw
      fc.height = gh
      fogImage.current = fc.getContext('2d')!.createImageData(gw, gh)
    }
    const data = f.data
    const frost = f.frost

    // ── detection (hands + face) throttled ──────────────────────
    const hand = handRef.current
    const face = faceRef.current
    if (video.readyState >= 2 && video.videoWidth > 0 && now - lastDetect.current > DETECT_MS) {
      const ts = now > lastDetect.current ? now : lastDetect.current + 1
      lastDetect.current = ts

      if (hand) {
        const res = hand.detectForVideo(video, ts)
        tipsRef.current = res.landmarks.map((lm) => mirroredPoint(lm[8], width, height))
      }
      if (face) {
        const lm = face.detectForVideo(video, ts).faceLandmarks[0]
        if (lm) {
          const up = lm[13]
          const low = lm[14]
          const l = lm[61]
          const r = lm[291]
          const mouthW = Math.hypot((r.x - l.x) * width, (r.y - l.y) * height) || 1
          const mouthH = Math.hypot((low.x - up.x) * width, (low.y - up.y) * height)
          const open = clamp((mouthH / mouthW - 0.18) / 0.4, 0, 1)
          breathRef.current = {
            x: (1 - (l.x + r.x) / 2) * width,
            y: ((up.y + low.y) / 2) * height,
            open,
          }
        } else {
          breathRef.current = null
        }
      }
    }

    // ── ambient condensation creeps back everywhere ─────────────
    const grow = CONDENSE * delta
    if (grow > 0) for (let i = 0; i < data.length; i++) if (data[i] < 1) data[i] = Math.min(1, data[i] + grow * frost[i])

    // ── breath fogs the glass near the mouth (denser, downward plume) ──
    const breath = breathRef.current
    if (breath && breath.open > 0.12) {
      const cx = breath.x
      const cy = breath.y
      const strength = breath.open * 1.9 * delta
      const rr = BREATH_R * (0.7 + breath.open * 0.6)
      const gx0 = clamp(Math.floor((cx - rr) / CELL), 0, gw - 1)
      const gx1 = clamp(Math.ceil((cx + rr) / CELL), 0, gw - 1)
      const gy0 = clamp(Math.floor((cy - rr * 0.5) / CELL), 0, gh - 1)
      const gy1 = clamp(Math.ceil((cy + rr * 1.3) / CELL), 0, gh - 1)
      for (let gy = gy0; gy <= gy1; gy++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          const dx = (gx * CELL - cx) / rr
          const dy = (gy * CELL - cy) / (rr * 1.15)
          const d2 = dx * dx + dy * dy
          if (d2 > 1) continue
          data[gy * gw + gx] = Math.min(1, data[gy * gw + gx] + strength * (1 - d2))
        }
      }
      // breath colours the ambient pad brighter
      audio?.setPadBrightness(clamp(0.3 + breath.open * 0.5, 0, 1))
    }

    // ── fingertips wipe the glass clear (along the motion segment) ──
    const tips = tipsRef.current
    let wipedThisFrame = 0
    const wipeAt = (x: number, y: number) => {
      const gx0 = clamp(Math.floor((x - WIPE_R) / CELL), 0, gw - 1)
      const gx1 = clamp(Math.ceil((x + WIPE_R) / CELL), 0, gw - 1)
      const gy0 = clamp(Math.floor((y - WIPE_R) / CELL), 0, gh - 1)
      const gy1 = clamp(Math.ceil((y + WIPE_R) / CELL), 0, gh - 1)
      for (let gy = gy0; gy <= gy1; gy++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          const dx = gx * CELL - x
          const dy = gy * CELL - y
          const d = Math.hypot(dx, dy)
          if (d > WIPE_R) continue
          const k = 1 - d / WIPE_R
          const idx = gy * gw + gx
          const before = data[idx]
          data[idx] = Math.max(0, before - (0.55 + k * 0.45))
          wipedThisFrame += before - data[idx]
        }
      }
    }
    for (let i = 0; i < tips.length; i++) {
      const tip = tips[i]
      const prev = prevTipsRef.current[i]
      if (prev) {
        const steps = Math.max(1, Math.floor(dist(prev, tip) / (WIPE_R * 0.5)))
        for (let s = 1; s <= steps; s++) {
          wipeAt(prev.x + ((tip.x - prev.x) * s) / steps, prev.y + ((tip.y - prev.y) * s) / steps)
        }
      } else {
        wipeAt(tip.x, tip.y)
      }
      prevTipsRef.current[i] = { x: tip.x, y: tip.y }
      // occasionally birth a drip at the wipe when clearing a lot
      if (wipedThisFrame > 6 && dripsRef.current.length < MAX_DRIPS && Math.random() < 0.25) {
        dripsRef.current.push({
          gx: clamp(Math.round(tip.x / CELL), 0, gw - 1),
          y: tip.y,
          vy: 30 + Math.random() * 40,
          r: 5 + Math.random() * 7,
          life: 1,
        })
      }
    }
    for (let i = tips.length; i < prevTipsRef.current.length; i++) prevTipsRef.current[i] = null

    // glassy tone traces the stroke, mapped to horizontal position
    if (wipedThisFrame > 4 && now - lastBellRef.current > 150) {
      lastBellRef.current = now
      const cx = tips[0]?.x ?? width / 2
      const note = clamp(Math.floor((cx / width) * GLASS_SCALE.length), 0, GLASS_SCALE.length - 1)
      audio?.bell(GLASS_SCALE[note], {
        bright: 0.4,
        dur: 1.6,
        gain: clamp(0.1 + wipedThisFrame * 0.01, 0.1, 0.32),
        pan: clamp((cx / width) * 2 - 1, -1, 1),
      })
    }

    // ── drips slide down, clearing a thin bead trail ────────────
    const drips = dripsRef.current
    for (const d of drips) {
      d.vy += 60 * delta
      d.y += d.vy * delta
      d.life -= delta * 0.35
      const x = d.gx * CELL
      const gy0 = clamp(Math.floor((d.y - d.r) / CELL), 0, gh - 1)
      const gy1 = clamp(Math.ceil((d.y + d.r) / CELL), 0, gh - 1)
      const gx0 = clamp(Math.floor((x - d.r) / CELL), 0, gw - 1)
      const gx1 = clamp(Math.ceil((x + d.r) / CELL), 0, gw - 1)
      for (let gy = gy0; gy <= gy1; gy++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          const dd = Math.hypot(gx * CELL - x, gy * CELL - d.y)
          if (dd > d.r) continue
          const idx = gy * gw + gx
          data[idx] = Math.max(0, data[idx] - (1 - dd / d.r) * 0.4)
        }
      }
    }
    dripsRef.current = drips.filter((d) => d.life > 0 && d.y < height + 20)

    // ════════ RENDER ════════════════════════════════════════════
    // 1. crisp webcam behind the glass
    ctx.save()
    ctx.translate(width, 0)
    ctx.scale(-1, 1)
    if (video.readyState >= 2 && video.videoWidth > 0) ctx.drawImage(video, 0, 0, width, height)
    else {
      ctx.fillStyle = '#0a0e12'
      ctx.fillRect(0, 0, width, height)
    }
    ctx.restore()

    // 2. fog buffer → white pixels with per-cell alpha
    const img = fogImage.current
    const fc = fogCanvas.current
    if (img && fc) {
      const px = img.data
      const [fr, fg, fb] = FOG_TINT
      for (let i = 0; i < data.length; i++) {
        const a = data[i]
        const j = i * 4
        // a touch of frost variance so cleared glass never looks perfectly flat
        px[j] = fr
        px[j + 1] = fg
        px[j + 2] = fb
        px[j + 3] = Math.round(clamp(a * frost[i], 0, 1) * 236)
      }
      const fctx = fc.getContext('2d')!
      fctx.putImageData(img, 0, 0)
      ctx.save()
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(fc, 0, 0, gw, gh, 0, 0, width, height)
      ctx.restore()
    }

    // 3. bright beads at the head of each drip
    for (const d of drips) {
      const x = d.gx * CELL
      ctx.globalAlpha = clamp(d.life, 0, 1) * 0.8
      const grd = ctx.createRadialGradient(x - 2, d.y - 2, 0, x, d.y, d.r)
      grd.addColorStop(0, 'rgba(255,255,255,0.9)')
      grd.addColorStop(1, 'rgba(180,205,220,0)')
      ctx.fillStyle = grd
      ctx.beginPath()
      ctx.arc(x, d.y, d.r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // 4. soft breath halo
    if (breath && breath.open > 0.12) {
      ctx.globalAlpha = 0.12 + breath.open * 0.16
      const grd = ctx.createRadialGradient(breath.x, breath.y + 20, 0, breath.x, breath.y + 20, BREATH_R)
      grd.addColorStop(0, 'rgba(230,240,248,0.9)')
      grd.addColorStop(1, 'rgba(230,240,248,0)')
      ctx.fillStyle = grd
      ctx.fillRect(0, 0, width, height)
      ctx.globalAlpha = 1
    }

    // HUD
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(20,28,34,0.5)'
    ctx.fillText(
      breath || tips.length ? 'breathe on the glass — wipe it clear with a fingertip' : 'lean in and breathe on the cold window',
      16,
      height - 16,
    )
  }, paused)

  return (
    <div className="relative size-full overflow-hidden bg-black" onPointerDown={() => audioRef.current?.resume()}>
      <video ref={videoRef} playsInline muted className="hidden" />
      <canvas ref={canvasRef} className="absolute inset-0 size-full touch-none" />
      <div className="absolute right-3 top-3">
        <SoundToggle muted={muted} onToggle={toggleMuted} />
      </div>
    </div>
  )
}

export default function FoggyPane({ paused }: ExperimentProps) {
  return (
    <WebcamGate hint="breathe on the camera to fog it up, then wipe the glass clear with your finger">
      {(video) => <Scene video={video} paused={paused} />}
    </WebcamGate>
  )
}

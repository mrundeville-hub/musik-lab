import { useEffect, useRef } from 'react'
import type { HandLandmarker, ImageSegmenter } from '@mediapipe/tasks-vision'
import { WebcamGate } from '@/shared/components/WebcamGate'
import { SoundToggle } from '@/shared/components/SoundToggle'
import type { ExperimentProps } from '@/shared/types'
import { useAnimationLoop } from '@/shared/hooks/useAnimationLoop'
import { useCanvas2D } from '@/shared/hooks/useCanvas2D'
import { useGlassAudio } from '@/shared/hooks/useGlassAudio'
import { GLASS_SCALE } from '@/shared/lib/glassAudio'
import { createHandLandmarker, createImageSegmenter } from '@/shared/lib/mediapipe'
import { dist, mirroredPoint, type Point } from '../_shared/asciiTools'

const SW = 192
const SH = 108
const MASK_T = 0.48
const DETECT_MS = 33
const PINCH_ON = 40
const PINCH_OFF = 58
const MAX_DROPS = 12

interface Drop {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  life: number
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function Scene({ video, paused }: { video: HTMLVideoElement } & ExperimentProps) {
  const { canvasRef, ctxRef, sizeRef } = useCanvas2D()
  const videoRef = useRef<HTMLVideoElement>(null)
  const segRef = useRef<ImageSegmenter | null>(null)
  const handRef = useRef<HandLandmarker | null>(null)
  const lastDetect = useRef(0)

  const maskRef = useRef<{ data: Float32Array | null; w: number; h: number }>({ data: null, w: 0, h: 0 })
  const mercury = useRef<HTMLCanvasElement | null>(null)
  const centroid = useRef({ x: 0.5, y: 0.5 })
  const wobble = useRef({ x: 0, y: 0, px: 0.5, py: 0.5 })
  const dropsRef = useRef<Drop[]>([])
  const pinchRef = useRef([{ on: false }, { on: false }])
  const tipsRef = useRef<{ mid: Point; gap: number }[]>([])
  const phase = useRef(0)

  const { audioRef, muted, toggleMuted } = useGlassAudio(paused, 0.25)

  useEffect(() => {
    const el = videoRef.current
    if (el) {
      el.srcObject = video.srcObject
      void el.play().catch(() => {})
    }
  }, [video])

  useEffect(() => {
    let alive = true
    void Promise.all([createImageSegmenter(), createHandLandmarker(2)]).then(([seg, hand]) => {
      if (alive) {
        segRef.current = seg
        handRef.current = hand
      } else {
        seg.close()
        hand.close()
      }
    })
    return () => {
      alive = false
      segRef.current?.close()
      handRef.current?.close()
      segRef.current = null
      handRef.current = null
    }
  }, [])

  useAnimationLoop((_elapsed, delta) => {
    const ctx = ctxRef.current
    if (!ctx) return
    const { width, height } = sizeRef.current
    if (!width || !height) return
    const now = performance.now()
    const audio = audioRef.current
    const dt = Math.min(delta, 0.05)
    phase.current += dt

    if (video.readyState >= 2 && video.videoWidth > 0 && now - lastDetect.current > DETECT_MS) {
      const ts = now > lastDetect.current ? now : lastDetect.current + 1
      lastDetect.current = ts

      segRef.current?.segmentForVideo(video, ts, (result) => {
        const mask = result.confidenceMasks?.[0]
        if (!mask) return
        const src = mask.getAsFloat32Array()
        const m = maskRef.current
        if (!m.data || m.data.length !== src.length) m.data = new Float32Array(src.length)
        m.data.set(src)
        m.w = mask.width
        m.h = mask.height
        // centroid
        let sx = 0
        let sy = 0
        let n = 0
        for (let y = 0; y < m.h; y += 2) {
          for (let x = 0; x < m.w; x += 2) {
            if (m.data[y * m.w + x] > MASK_T) {
              sx += x
              sy += y
              n++
            }
          }
        }
        if (n > 0) {
          // mirrored space
          centroid.current = { x: 1 - sx / n / m.w, y: sy / n / m.h }
        }
      })

      const hand = handRef.current
      if (hand) {
        const res = hand.detectForVideo(video, ts)
        const tips = res.landmarks.map((l) => {
          const thumb = mirroredPoint(l[4], width, height)
          const index = mirroredPoint(l[8], width, height)
          return { mid: { x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 }, gap: dist(thumb, index) }
        })
        tipsRef.current = tips
        for (let i = 0; i < 2; i++) {
          const t = tips[i]
          const p = pinchRef.current[i]
          if (!t) {
            p.on = false
            continue
          }
          if (!p.on && t.gap < PINCH_ON) {
            p.on = true
            // tear droplet if near silhouette
            if (insideMask(t.mid.x, t.mid.y, width, height) && dropsRef.current.length < MAX_DROPS) {
              dropsRef.current.push({
                x: t.mid.x,
                y: t.mid.y,
                vx: (Math.random() - 0.5) * 40,
                vy: 40 + Math.random() * 60,
                r: 10 + Math.random() * 10,
                life: 1,
              })
              audio?.bell(GLASS_SCALE[1], { bright: 0.95, dur: 1.4, gain: 0.45 })
            }
          } else if (p.on && t.gap > PINCH_OFF) {
            p.on = false
          }
        }
      }
    }

    // wobble from centroid motion
    const c = centroid.current
    const w = wobble.current
    w.x = lerp(w.x, (c.x - w.px) * 28, 0.2)
    w.y = lerp(w.y, (c.y - w.py) * 28, 0.2)
    w.px = lerp(w.px, c.x, 0.15)
    w.py = lerp(w.py, c.y, 0.15)
    w.x *= 0.92
    w.y *= 0.92

    // droplets
    const cx = c.x * width
    const cy = c.y * height
    for (const d of dropsRef.current) {
      d.vy += 420 * dt
      d.x += d.vx * dt
      d.y += d.vy * dt
      d.life -= dt * 0.15
      // reabsorb near centroid / silhouette
      if (insideMask(d.x, d.y, width, height) && d.y > cy - 20) {
        const pull = dist(d, { x: cx, y: cy })
        if (pull < 80 || d.life < 0.2) {
          d.life = 0
          audio?.bell(GLASS_SCALE[0], { bright: 0.7, dur: 0.9, gain: 0.3 })
          audio?.sparkle(clamp((d.x / width) * 2 - 1, -1, 1))
        }
      }
    }
    dropsRef.current = dropsRef.current.filter((d) => d.life > 0 && d.y < height + 40)

    // background
    ctx.fillStyle = '#0a0c10'
    ctx.fillRect(0, 0, width, height)
    if (video.readyState >= 2) {
      ctx.save()
      ctx.globalAlpha = 0.18
      ctx.translate(width, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(video, 0, 0, width, height)
      ctx.restore()
    }

    // mercury silhouette canvas
    let mc = mercury.current
    if (!mc) {
      mc = document.createElement('canvas')
      mercury.current = mc
    }
    if (mc.width !== SW || mc.height !== SH) {
      mc.width = SW
      mc.height = SH
    }
    const mctx = mc.getContext('2d')
    const m = maskRef.current
    if (mctx && m.data) {
      const img = mctx.createImageData(SW, SH)
      const t = phase.current
      for (let y = 0; y < SH; y++) {
        for (let x = 0; x < SW; x++) {
          // sample mask mirrored
          const mx = Math.floor(((SW - 1 - x) / (SW - 1)) * (m.w - 1))
          const my = Math.floor((y / (SH - 1)) * (m.h - 1))
          const v = m.data[my * m.w + mx] ?? 0
          const i = (y * SW + x) * 4
          if (v > MASK_T) {
            const nx = x / SW
            const ny = y / SH
            const ripple = Math.sin((nx + w.x * 0.02) * 18 + t * 3) * Math.cos((ny + w.y * 0.02) * 14 - t * 2.2)
            const light = 0.35 + ripple * 0.2 + (1 - ny) * 0.25
            // mercury palette
            img.data[i] = Math.round(140 + light * 90)
            img.data[i + 1] = Math.round(150 + light * 85)
            img.data[i + 2] = Math.round(165 + light * 70)
            img.data[i + 3] = Math.round(200 + v * 55)
          } else {
            img.data[i + 3] = 0
          }
        }
      }
      mctx.putImageData(img, 0, 0)

      // specular streak
      mctx.globalCompositeOperation = 'screen'
      const g = mctx.createLinearGradient(0, 0, SW, SH * 0.4)
      g.addColorStop(0, 'rgba(255,255,255,0)')
      g.addColorStop(0.45, `rgba(230,245,255,${0.25 + Math.abs(w.x) * 0.02})`)
      g.addColorStop(1, 'rgba(255,255,255,0)')
      mctx.fillStyle = g
      mctx.fillRect(0, 0, SW, SH)
      mctx.globalCompositeOperation = 'source-over'
    }

    ctx.save()
    ctx.translate(w.x * 1.5, w.y * 1.5)
    ctx.imageSmoothingEnabled = true
    if (mc) ctx.drawImage(mc, 0, 0, width, height)
    ctx.restore()

    // droplets
    for (const d of dropsRef.current) {
      const grd = ctx.createRadialGradient(d.x - d.r * 0.3, d.y - d.r * 0.35, 1, d.x, d.y, d.r)
      grd.addColorStop(0, 'rgba(255,255,255,0.95)')
      grd.addColorStop(0.35, 'rgba(190,210,230,0.9)')
      grd.addColorStop(1, 'rgba(80,100,120,0.55)')
      ctx.beginPath()
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
      ctx.fillStyle = grd
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'
      ctx.lineWidth = 1
      ctx.stroke()
    }

    audio?.setPadBrightness(0.15 + Math.min(1, Math.hypot(w.x, w.y) / 8) * 0.4)

    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.fillStyle = 'rgba(200,220,240,0.55)'
    ctx.fillText(
      m.data ? 'move your head to ripple · pinch the mercury to tear a drop' : 'step into frame — filling with mercury…',
      16,
      height - 16,
    )
  }, paused)

  function insideMask(x: number, y: number, width: number, height: number) {
    const m = maskRef.current
    if (!m.data) return false
    const mx = Math.floor((1 - x / width) * (m.w - 1))
    const my = Math.floor((y / height) * (m.h - 1))
    if (mx < 0 || my < 0 || mx >= m.w || my >= m.h) return false
    return m.data[my * m.w + mx] > MASK_T
  }

  return (
    <div className="relative size-full overflow-hidden bg-[#0a0c10]" onPointerDown={() => audioRef.current?.resume()}>
      <video ref={videoRef} playsInline muted className="hidden" />
      <canvas ref={canvasRef} className="absolute inset-0 size-full touch-none" />
      <div className="absolute right-3 top-3">
        <SoundToggle muted={muted} onToggle={toggleMuted} />
      </div>
    </div>
  )
}

export default function MercuryFace({ paused }: ExperimentProps) {
  return (
    <WebcamGate hint="your silhouette floods with mercury — pinch to tear a droplet">
      {(video) => <Scene video={video} paused={paused} />}
    </WebcamGate>
  )
}

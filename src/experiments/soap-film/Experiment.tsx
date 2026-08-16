import { useEffect, useRef } from 'react'
import type { HandLandmarker } from '@mediapipe/tasks-vision'
import { WebcamGate } from '@/shared/components/WebcamGate'
import { SoundToggle } from '@/shared/components/SoundToggle'
import type { ExperimentProps } from '@/shared/types'
import { useAnimationLoop } from '@/shared/hooks/useAnimationLoop'
import { useCanvas2D } from '@/shared/hooks/useCanvas2D'
import { useGlassAudio } from '@/shared/hooks/useGlassAudio'
import { GLASS_SCALE } from '@/shared/lib/glassAudio'
import { createHandLandmarker } from '@/shared/lib/mediapipe'
import { dist, drawDimWebcam, mirroredPoint, type Point } from '../_shared/asciiTools'

const MIN_GAP = 34 // px — below this the film is fully formed & fat
const POP_GAP = 320 // px — stretched past this the film bursts
const REFORM_GAP = 150 // must come back under this to bloom a new film
const HUE_STOPS = 14
const MAX_PARTS = 160
const DETECT_MS = 33

interface Film {
  formed: boolean
  stretch: number // 0..1 smoothed
  wobble: number
  hue: number // slowly drifting base hue
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  hue: number
  life: number
  bubble: boolean // true = drifting bubble, false = droplet
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function Scene({ video, paused }: { video: HTMLVideoElement } & ExperimentProps) {
  const { canvasRef, ctxRef, sizeRef } = useCanvas2D()
  const handRef = useRef<HandLandmarker | null>(null)
  const lastDetect = useRef(0)
  const filmsRef = useRef<Film[]>([
    { formed: false, stretch: 0, wobble: 0, hue: 190 },
    { formed: false, stretch: 0, wobble: 3.1, hue: 40 },
  ])
  const tipsRef = useRef<{ thumb: Point; index: Point; gap: number }[]>([])
  const partsRef = useRef<Particle[]>([])
  const { audioRef, muted, toggleMuted } = useGlassAudio(paused, 0.45)

  useEffect(() => {
    let alive = true
    void createHandLandmarker(2).then((lm) => {
      if (alive) handRef.current = lm
      else lm.close()
    })
    return () => {
      alive = false
      handRef.current?.close()
      handRef.current = null
    }
  }, [])

  const burst = (cx: number, cy: number, radius: number, hue: number) => {
    const parts = partsRef.current
    const n = 26 + Math.floor(Math.random() * 12)
    for (let i = 0; i < n; i++) {
      if (parts.length >= MAX_PARTS) break
      const a = Math.random() * Math.PI * 2
      const sp = 120 + Math.random() * 260
      const bubble = Math.random() < 0.28
      parts.push({
        x: cx + Math.cos(a) * radius * 0.6,
        y: cy + Math.sin(a) * radius * 0.6,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        r: bubble ? 6 + Math.random() * 12 : 2 + Math.random() * 4,
        hue: (hue + Math.random() * 80) % 360,
        life: 1,
        bubble,
      })
    }
  }

  useAnimationLoop((elapsed, delta) => {
    const ctx = ctxRef.current
    if (!ctx) return
    const { width, height } = sizeRef.current
    if (!width || !height) return
    const now = performance.now()
    const audio = audioRef.current

    // ── detect hands ────────────────────────────────────────────
    const lm = handRef.current
    if (lm && video.readyState >= 2 && video.videoWidth > 0 && now - lastDetect.current > DETECT_MS) {
      const ts = now > lastDetect.current ? now : lastDetect.current + 1
      lastDetect.current = ts
      const res = lm.detectForVideo(video, ts)
      const raw = res.landmarks.map((l) => {
        const thumb = mirroredPoint(l[4], width, height)
        const index = mirroredPoint(l[8], width, height)
        return { thumb, index, gap: dist(thumb, index), palmX: (1 - l[0].x) * width }
      })
      raw.sort((a, b) => a.palmX - b.palmX)
      tipsRef.current = raw.map(({ thumb, index, gap }) => ({ thumb, index, gap }))
    }

    // background: dim mirrored webcam
    ctx.fillStyle = '#05070c'
    ctx.fillRect(0, 0, width, height)
    drawDimWebcam(ctx, video, width, height, 0.55)
    ctx.fillStyle = 'rgba(5,7,12,0.35)'
    ctx.fillRect(0, 0, width, height)

    const tips = tipsRef.current

    // ── update + draw each film ─────────────────────────────────
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    for (let h = 0; h < 2; h++) {
      const film = filmsRef.current[h]
      const hand = tips[h]
      if (!hand) {
        film.formed = false
        film.stretch = lerp(film.stretch, 0, 0.2)
        continue
      }
      const cx = (hand.thumb.x + hand.index.x) / 2
      const cy = (hand.thumb.y + hand.index.y) / 2
      const radius = clamp(hand.gap * 0.55, 16, POP_GAP * 0.6)
      const targetStretch = clamp((hand.gap - MIN_GAP) / (POP_GAP - MIN_GAP), 0, 1)

      // reforming logic
      if (!film.formed && hand.gap < REFORM_GAP) {
        film.formed = true
        film.hue = Math.random() * 360
        audio?.bell(GLASS_SCALE[1 + h * 2], { bright: 0.5, dur: 1.8, gain: 0.22, pan: (cx / width) * 2 - 1 })
      }
      if (film.formed && hand.gap > POP_GAP) {
        film.formed = false
        burst(cx, cy, radius, film.hue)
        audio?.chord(GLASS_SCALE[3], { bright: 0.85, dur: 2.4, gain: 0.4, pan: (cx / width) * 2 - 1 })
        for (let s = 0; s < 3; s++) audio?.sparkle((cx / width) * 2 - 1)
      }

      film.stretch = lerp(film.stretch, film.formed ? targetStretch : 0, 0.25)
      film.hue = (film.hue + delta * (8 + film.stretch * 40)) % 360
      film.wobble += delta

      if (film.formed) {
        drawFilm(ctx, cx, cy, radius, film, elapsed)
        // stretch drives the ambient shimmer + a running sparkle as it thins
        audio?.setPadBrightness(clamp(0.2 + film.stretch * 0.7, 0, 1))
        if (film.stretch > 0.55 && Math.random() < film.stretch * 0.25) {
          audio?.sparkle((cx / width) * 2 - 1)
        }
      }

      // fingertip anchors
      ctx.globalCompositeOperation = 'source-over'
      for (const p of [hand.thumb, hand.index]) {
        ctx.fillStyle = 'rgba(226,244,255,0.9)'
        ctx.shadowColor = 'rgba(180,230,255,0.9)'
        ctx.shadowBlur = 8
        ctx.beginPath()
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
      }
      ctx.globalCompositeOperation = 'screen'
    }
    ctx.restore()

    // ── update + draw particles (droplets + drifting bubbles) ───
    const parts = partsRef.current
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    for (const p of parts) {
      if (p.bubble) {
        p.vy -= 24 * delta // bubbles rise
        p.vx *= 0.98
        p.vy *= 0.99
        p.life -= delta * 0.28
      } else {
        p.vy += 240 * delta // droplets fall
        p.vx *= 0.96
        p.life -= delta * 0.6
      }
      p.x += p.vx * delta
      p.y += p.vy * delta
      const a = clamp(p.life, 0, 1)
      if (p.bubble) {
        const grd = ctx.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.3, 0, p.x, p.y, p.r)
        grd.addColorStop(0, `hsla(${p.hue}, 90%, 85%, ${a * 0.5})`)
        grd.addColorStop(0.6, `hsla(${(p.hue + 60) % 360}, 90%, 65%, ${a * 0.35})`)
        grd.addColorStop(1, `hsla(${(p.hue + 140) % 360}, 90%, 60%, 0)`)
        ctx.fillStyle = grd
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.fillStyle = `hsla(${p.hue}, 95%, 78%, ${a})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.restore()
    partsRef.current = parts.filter((p) => p.life > 0 && p.y < height + 40 && p.y > -40)

    // HUD
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(210,230,245,0.6)'
    ctx.fillText(
      tips.length ? 'pinch to hold the film — open slowly to stretch it thin, too far and it pops' : 'pinch thumb + index to blow a soap film',
      16,
      height - 16,
    )
  }, paused)

  return (
    <div className="relative size-full overflow-hidden bg-black" onPointerDown={() => audioRef.current?.resume()}>
      <canvas ref={canvasRef} className="absolute inset-0 size-full touch-none" />
      <div className="absolute right-3 top-3">
        <SoundToggle muted={muted} onToggle={toggleMuted} />
      </div>
    </div>
  )
}

/** Draw one soap film: wobbly clipped disc filled with thin-film interference. */
function drawFilm(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, film: Film, t: number) {
  const thin = film.stretch // thinner (more fringes, more transparent) as it stretches
  const wob = 1 + Math.sin(t * 2 + film.wobble) * 0.05

  ctx.save()
  // wobbly rim clip
  ctx.beginPath()
  const segs = 40
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2
    const rr = radius * wob * (1 + Math.sin(a * 3 + t * 2 + film.wobble) * 0.03 + Math.sin(a * 5 - t) * 0.02)
    const x = cx + Math.cos(a) * rr
    const y = cy + Math.sin(a) * rr * 0.98
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.clip()

  // interference: offset radial gradient with racing hue rings
  const ox = cx + Math.sin(t * 0.7 + film.wobble) * radius * 0.18
  const oy = cy - radius * 0.22 + Math.cos(t * 0.6) * radius * 0.12
  const grd = ctx.createRadialGradient(ox, oy, 0, cx, cy, radius * 1.15)
  const fringes = 1.5 + thin * 4 // stretch = more, tighter fringes
  for (let i = 0; i <= HUE_STOPS; i++) {
    const pos = i / HUE_STOPS
    const hue = (film.hue + pos * fringes * 130 + t * 20) % 360
    const light = 55 + Math.sin(pos * Math.PI) * 25
    const alpha = (0.85 - thin * 0.45) * (0.35 + 0.65 * Math.cos(pos * Math.PI * 0.5))
    grd.addColorStop(pos, `hsla(${hue}, 92%, ${light}%, ${clamp(alpha, 0, 1)})`)
  }
  ctx.fillStyle = grd
  ctx.fillRect(cx - radius * 1.3, cy - radius * 1.3, radius * 2.6, radius * 2.6)

  // specular sheen lobe (top-left)
  const sheen = ctx.createRadialGradient(cx - radius * 0.4, cy - radius * 0.45, 0, cx - radius * 0.4, cy - radius * 0.45, radius * 0.9)
  sheen.addColorStop(0, 'rgba(255,255,255,0.5)')
  sheen.addColorStop(0.4, 'rgba(255,255,255,0.12)')
  sheen.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = sheen
  ctx.fillRect(cx - radius * 1.3, cy - radius * 1.3, radius * 2.6, radius * 2.6)
  ctx.restore()

  // bright rim
  ctx.save()
  ctx.strokeStyle = `hsla(${(film.hue + 200) % 360}, 90%, 82%, ${0.5 - thin * 0.3})`
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.ellipse(cx, cy, radius * wob, radius * wob * 0.98, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

export default function SoapFilm({ paused }: ExperimentProps) {
  return (
    <WebcamGate hint="pinch thumb and index to hold a soap film, then slowly open your fingers to stretch it">
      {(video) => <Scene video={video} paused={paused} />}
    </WebcamGate>
  )
}

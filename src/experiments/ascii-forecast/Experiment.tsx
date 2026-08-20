import { useEffect, useRef } from 'react'
import type { FaceLandmarker } from '@mediapipe/tasks-vision'
import { WebcamGate } from '@/shared/components/WebcamGate'
import { SoundToggle } from '@/shared/components/SoundToggle'
import type { ExperimentProps } from '@/shared/types'
import { useAnimationLoop } from '@/shared/hooks/useAnimationLoop'
import { useCanvas2D } from '@/shared/hooks/useCanvas2D'
import { useGlassAudio } from '@/shared/hooks/useGlassAudio'
import { GLASS_SCALE } from '@/shared/lib/glassAudio'
import { createFaceLandmarker } from '@/shared/lib/mediapipe'

const CELL = 14
const DETECT_MS = 33
const MAX_RAIN = 120
const SUN = ['.', '*', 'o', '+', '☼', '·']
const CLOUD = ['~', '-', '=', '`', '·']
const RAIN = ['|', '/', '\\', ':', '·', '#']

interface Drop {
  x: number
  y: number
  vy: number
  char: string
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function eyeOpen(lm: { x: number; y: number }[], a: number, b: number, c: number, d: number) {
  const v = Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y)
  const h = Math.hypot(lm[c].x - lm[d].x, lm[c].y - lm[d].y) || 1e-6
  return v / h
}

function Scene({ video, paused }: { video: HTMLVideoElement } & ExperimentProps) {
  const { canvasRef, ctxRef, sizeRef } = useCanvas2D()
  const faceRef = useRef<FaceLandmarker | null>(null)
  const lastDetect = useRef(0)
  const weather = useRef({ smile: 0, frown: 0, yaw: 0, blink: 0, open: 0 })
  const rainRef = useRef<Drop[]>([])
  const flashRef = useRef(0)
  const wasBlink = useRef(false)
  const phase = useRef(0)
  const lastDrip = useRef(0)

  const { audioRef, muted, toggleMuted } = useGlassAudio(paused, 0.28)

  useEffect(() => {
    let alive = true
    void createFaceLandmarker().then((lm) => {
      if (alive) faceRef.current = lm
      else lm.close()
    })
    return () => {
      alive = false
      faceRef.current?.close()
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
    const dt = Math.min(delta, 0.05)
    phase.current += dt

    if (video.readyState >= 2 && video.videoWidth > 0 && now - lastDetect.current > DETECT_MS) {
      const ts = now > lastDetect.current ? now : lastDetect.current + 1
      lastDetect.current = ts
      const lm = faceRef.current?.detectForVideo(video, ts).faceLandmarks[0]
      if (lm) {
        const mouthW = Math.hypot(lm[291].x - lm[61].x, lm[291].y - lm[61].y)
        const eyeW = Math.hypot(lm[263].x - lm[33].x, lm[263].y - lm[33].y) || 1e-6
        const mouthRatio = mouthW / eyeW
        const cornersY = (lm[61].y + lm[291].y) / 2
        const midY = (lm[13].y + lm[14].y) / 2
        const cornerLift = (midY - cornersY) / eyeW // smile when corners above mid
        const smile = clamp((mouthRatio - 0.42) / 0.22 + cornerLift * 4, 0, 1)
        const frown = clamp((-cornerLift * 6 - mouthRatio * 0.4), 0, 1)
        const nose = lm[1]
        const cheek = (lm[234].x + lm[454].x) / 2
        const yaw = clamp((cheek - nose.x) * 6, -1, 1)
        const left = eyeOpen(lm, 159, 145, 33, 133)
        const right = eyeOpen(lm, 386, 374, 362, 263)
        const ear = (left + right) / 2
        const blink = ear < 0.18 ? 1 : 0
        const up = lm[13]
        const low = lm[14]
        const open = clamp((Math.hypot(low.x - up.x, low.y - up.y) / mouthW - 0.15) / 0.4, 0, 1)
        const w = weather.current
        w.smile = lerp(w.smile, smile, 0.25)
        w.frown = lerp(w.frown, frown, 0.25)
        w.yaw = lerp(w.yaw, yaw, 0.2)
        w.open = lerp(w.open, open, 0.3)
        w.blink = blink
      }
    }

    const w = weather.current
    if (w.blink > 0.5 && !wasBlink.current) {
      flashRef.current = 1
      audio?.bell(GLASS_SCALE[4], { bright: 0.9, dur: 0.6, gain: 0.55 })
      audio?.sparkle(w.yaw)
    }
    wasBlink.current = w.blink > 0.5
    flashRef.current = Math.max(0, flashRef.current - dt * 3.2)

    // rain spawn
    if (w.frown > 0.25 && rainRef.current.length < MAX_RAIN && Math.random() < w.frown * 0.55) {
      rainRef.current.push({
        x: Math.random() * width,
        y: -10,
        vy: 140 + Math.random() * 220 + w.frown * 120,
        char: RAIN[(Math.random() * RAIN.length) | 0],
      })
      if (now - lastDrip.current > 180) {
        lastDrip.current = now
        audio?.sparkle(clamp((Math.random() * 2 - 1), -1, 1))
      }
    }

    const wind = w.yaw * 90
    for (const d of rainRef.current) {
      d.y += d.vy * dt
      d.x += wind * dt
    }
    rainRef.current = rainRef.current.filter((d) => d.y < height + 20)

    // sky tint
    const sun = w.smile
    const rainAmt = w.frown
    const r = Math.round(lerp(28, 70, sun) + rainAmt * 8)
    const g = Math.round(lerp(36, 110, sun) + rainAmt * 12)
    const b = Math.round(lerp(58, 160, sun) - rainAmt * 20)
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.fillRect(0, 0, width, height)

    // glyph field
    const cols = Math.ceil(width / CELL)
    const rows = Math.ceil(height / CELL)
    ctx.font = `bold ${CELL - 2}px ui-monospace, SFMono-Regular, Menlo, monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const t = phase.current

    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const x = gx * CELL + CELL / 2
        const y = gy * CELL + CELL / 2
        const n = Math.sin(gx * 0.37 + t * 1.2 + w.yaw) * Math.cos(gy * 0.29 - t * 0.8)
        let ch: string
        if (sun > 0.2 && n > 0.1 - sun * 0.4) {
          ch = SUN[(gx + gy + ((t * 3) | 0)) % SUN.length]
          ctx.fillStyle = `rgba(255,230,120,${0.35 + sun * 0.55})`
        } else if (rainAmt > 0.15 && n < rainAmt * 0.5) {
          ch = CLOUD[(gx * 3 + gy) % CLOUD.length]
          ctx.fillStyle = `rgba(190,210,230,${0.25 + rainAmt * 0.4})`
        } else if (Math.abs(n) < 0.08) {
          ch = '·'
          ctx.fillStyle = 'rgba(160,180,200,0.2)'
        } else {
          continue
        }
        const drift = wind * 0.04 * (1 + (gy % 5) * 0.1)
        ctx.fillText(ch, x + drift, y)
      }
    }

    // rain glyphs
    ctx.fillStyle = 'rgba(170,210,255,0.85)'
    for (const d of rainRef.current) {
      ctx.fillText(d.char, d.x, d.y)
    }

    // lightning
    if (flashRef.current > 0) {
      ctx.globalAlpha = flashRef.current * 0.85
      ctx.fillStyle = '#e8f0ff'
      ctx.fillRect(0, 0, width, height)
      ctx.globalAlpha = 1
      ctx.strokeStyle = `rgba(255,255,255,${flashRef.current})`
      ctx.lineWidth = 2
      ctx.beginPath()
      let lx = width * (0.3 + Math.abs(w.yaw) * 0.2)
      let ly = 0
      ctx.moveTo(lx, ly)
      while (ly < height) {
        lx += (Math.random() - 0.5) * 40
        ly += 18 + Math.random() * 28
        ctx.lineTo(lx, ly)
      }
      ctx.stroke()
      audio?.setPadBrightness(0.8)
    } else {
      audio?.setPadBrightness(0.15 + sun * 0.5)
    }

    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = 'rgba(240,248,255,0.55)'
    ctx.fillText(
      sun > 0.35 ? 'clear skies — blink for lightning' : rainAmt > 0.3 ? 'rain front — turn head for wind' : 'smile / frown / blink · face the camera',
      16,
      height - 16,
    )
  }, paused)

  return (
    <div className="relative size-full overflow-hidden bg-[#1a2430]" onPointerDown={() => audioRef.current?.resume()}>
      <canvas ref={canvasRef} className="absolute inset-0 size-full touch-none" />
      <div className="absolute right-3 top-3">
        <SoundToggle muted={muted} onToggle={toggleMuted} />
      </div>
    </div>
  )
}

export default function AsciiForecast({ paused }: ExperimentProps) {
  return (
    <WebcamGate hint="face the camera — smile for sun, frown for rain, blink for lightning">
      {(video) => <Scene video={video} paused={paused} />}
    </WebcamGate>
  )
}

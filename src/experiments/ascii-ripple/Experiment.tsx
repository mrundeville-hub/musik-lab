import { useEffect, useRef } from 'react'
import type { HandLandmarker } from '@mediapipe/tasks-vision'
import type { ExperimentProps } from '@/shared/types'
import { useCanvas2D } from '@/shared/hooks/useCanvas2D'
import { useAnimationLoop } from '@/shared/hooks/useAnimationLoop'
import { WebcamGate } from '@/shared/components/WebcamGate'
import { createHandLandmarker } from '@/shared/lib/mediapipe'
import { GLASS_SCALE } from '@/shared/lib/glassAudio'
import { useGlassAudio } from '@/shared/hooks/useGlassAudio'
import { SoundToggle } from '@/shared/components/SoundToggle'

const RIPPLE_CHARS = '~=-_+*#@'
// Precomputed alpha palette so the draw loop reuses strings instead of
// allocating a fresh `rgba(...)` per cell every frame.
const FILL_STEPS = 12
const FILL_PALETTE = Array.from({ length: FILL_STEPS }, (_, k) => {
  const alpha = 0.18 + (k / (FILL_STEPS - 1)) * 0.72
  return `rgba(186,222,255,${alpha.toFixed(3)})`
})
const CELL_W = 14
const CELL_H = 20
const DAMPING = 0.94
const STRENGTH = 800
const Z_THRESHOLD = -0.18
const COOLDOWN_MS = 400
const DETECT_INTERVAL_MS = 80
// fingertip landmark indices: index, middle, ring, pinky
const TIPS = [8, 12, 16, 20]

interface Field {
  prev: Float32Array
  curr: Float32Array
  cols: number
  rows: number
}

function makeField(cols: number, rows: number): Field {
  return {
    prev: new Float32Array(cols * rows),
    curr: new Float32Array(cols * rows),
    cols,
    rows,
  }
}

function stepField(f: Field) {
  const { prev, curr, cols, rows } = f
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      const i = y * cols + x
      const v =
        (prev[i - 1] + prev[i + 1] + prev[i - cols] + prev[i + cols]) * 0.5 -
        curr[i]
      curr[i] = v * DAMPING
    }
  }
  const t = f.prev
  f.prev = f.curr
  f.curr = t
}

function inject(f: Field, gx: number, gy: number, strength = STRENGTH) {
  const x = Math.max(2, Math.min(f.cols - 3, Math.round(gx)))
  const y = Math.max(2, Math.min(f.rows - 3, Math.round(gy)))
  const i = y * f.cols + x
  f.prev[i] += strength
  const splash = strength * 0.4
  f.prev[i - 1] += splash
  f.prev[i + 1] += splash
  f.prev[i - f.cols] += splash
  f.prev[i + f.cols] += splash
}

function Scene({ video, paused }: { video: HTMLVideoElement } & ExperimentProps) {
  const { canvasRef, ctxRef, sizeRef } = useCanvas2D()
  const videoRef = useRef<HTMLVideoElement>(null)
  const fieldRef = useRef<Field | null>(null)
  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const lastInject = useRef(0)
  const fingertips = useRef<{ x: number; y: number }[]>([])
  const { audioRef, muted, toggleMuted } = useGlassAudio(paused)
  const lastEnergyCheck = useRef(0)
  const nextSparkle = useRef(0)

  const lastSplashSound = useRef(0)

  useEffect(() => {
    const el = videoRef.current
    if (!el || !video.srcObject) return
    el.srcObject = video.srcObject
    void el.play().catch(() => {})
  }, [video])

  // watery glass plink — pitch by vertical position (higher on screen = higher note)
  const splashSound = (x: number, y: number, strength = 1) => {
    const { width, height } = sizeRef.current
    if (!width || !height) return
    const t = performance.now()
    if (t - lastSplashSound.current < 120) return
    lastSplashSound.current = t
    const audio = audioRef.current
    if (!audio) return
    const idx = Math.max(0, Math.min(5, Math.floor((1 - y / height) * 5)))
    audio.bell(GLASS_SCALE[idx], {
      bright: 0.8,
      dur: 2.8,
      gain: 0.4 + strength * 0.3,
      pan: (x / width) * 2 - 1,
    })
    // a lower partner note a beat later — "drop into water"
    setTimeout(() => {
      audioRef.current?.bell(GLASS_SCALE[Math.max(0, idx - 2)] / 2, {
        bright: 0.3,
        dur: 3.5,
        gain: 0.25,
        pan: (x / width) * 2 - 1,
      })
    }, 120)
  }

  useEffect(() => {
    let alive = true
    void createHandLandmarker(1).then((lm) => {
      if (alive) landmarkerRef.current = lm
      else lm.close()
    })
    return () => {
      alive = false
      landmarkerRef.current?.close()
      landmarkerRef.current = null
    }
  }, [])

  // Detection runs on its own cadence, decoupled from the render loop, so a
  // ~20ms MediaPipe inference never stalls the 60fps ripple animation.
  useEffect(() => {
    if (paused) {
      fingertips.current = []
      return
    }
    let cancelled = false
    let handle = 0
    const detect = () => {
      if (cancelled) return
      const lm = landmarkerRef.current
      const field = fieldRef.current
      const { width, height } = sizeRef.current
      if (lm && field && width && height && video.readyState >= 2) {
        const now = performance.now()
        const res = lm.detectForVideo(video, now)
        const tips: { x: number; y: number }[] = []
        for (const hand of res.landmarks) {
          for (const tip of TIPS) {
            const p = hand[tip]
            const x = (1 - p.x) * width // mirror
            const y = p.y * height
            tips.push({ x, y })
            if (p.z < Z_THRESHOLD && now - lastInject.current > COOLDOWN_MS) {
              lastInject.current = now
              inject(field, x / CELL_W, y / CELL_H)
              splashSound(x, y)
            }
          }
        }
        fingertips.current = tips
      }
      handle = window.setTimeout(detect, DETECT_INTERVAL_MS)
    }
    handle = window.setTimeout(detect, DETECT_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [paused, video])

  useAnimationLoop(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    const { width, height } = sizeRef.current
    if (!width || !height) return

    const cols = Math.floor(width / CELL_W)
    const rows = Math.floor(height / CELL_H)
    let field = fieldRef.current
    if (!field || field.cols !== cols || field.rows !== rows) {
      field = makeField(cols, rows)
      fieldRef.current = field
    }

    // hand tracking runs in its own loop; here we only advance & draw.
    const now = performance.now()

    stepField(field)

    // pad follows total wave energy: still water = dark, waves = bright + sparkles
    if (now - lastEnergyCheck.current > 150) {
      lastEnergyCheck.current = now
      let energy = 0
      const { prev: p } = field
      for (let i = 0; i < p.length; i += 7) energy += Math.abs(p[i])
      const level = Math.min(1, energy / (p.length * 2))
      audioRef.current?.setPadBrightness(0.1 + level * 0.9)
      if (level > 0.05 && now > nextSparkle.current) {
        audioRef.current?.sparkle(Math.random() * 2 - 1)
        nextSparkle.current = now + 200 + (1 - level) * 1200
      }
    }

    ctx.clearRect(0, 0, width, height)

    ctx.font = '11px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const { prev } = field
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const i = row * cols + col
        const ripple = Math.abs(prev[i])
        if (ripple < 1.5) continue
        const intensity = Math.min(1, ripple * 0.025)
        const char = RIPPLE_CHARS[Math.floor(intensity * (RIPPLE_CHARS.length - 1))]

        // refraction: displace along ripple gradient
        let ox = 0
        let oy = 0
        if (col > 0 && col < cols - 1 && row > 0 && row < rows - 1) {
          ox = (prev[i + 1] - prev[i - 1]) * 0.3
          oy = (prev[i + cols] - prev[i - cols]) * 0.3
        }

        ctx.fillStyle = FILL_PALETTE[Math.floor(intensity * (FILL_STEPS - 1))]
        ctx.fillText(char, col * CELL_W + CELL_W / 2 + ox, row * CELL_H + CELL_H / 2 + oy)
      }
    }

    // fingertip markers
    ctx.fillStyle = 'rgba(186,222,255,0.45)'
    for (const tip of fingertips.current) {
      ctx.beginPath()
      ctx.arc(tip.x, tip.y, 4, 0, Math.PI * 2)
      ctx.fill()
    }
  }, paused)

  const splashAt = (clientX: number, clientY: number, el: HTMLCanvasElement) => {
    const rect = el.getBoundingClientRect()
    const field = fieldRef.current
    if (!field) return
    inject(
      field,
      (clientX - rect.left) / CELL_W,
      (clientY - rect.top) / CELL_H,
      STRENGTH * 0.7,
    )
    splashSound(clientX - rect.left, clientY - rect.top, 0.7)
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <video
        ref={videoRef}
        playsInline
        muted
        className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
      />
      <div className="absolute inset-0 bg-black/10" />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={(e) => splashAt(e.clientX, e.clientY, e.currentTarget)}
        onPointerMove={(e) => {
          if (e.buttons & 1) splashAt(e.clientX, e.clientY, e.currentTarget)
        }}
      />
      <SoundToggle muted={muted} onToggle={toggleMuted} />
    </div>
  )
}

export default function AsciiRipple({ paused }: ExperimentProps) {
  return (
    <WebcamGate hint="an ASCII mirror with ripple physics — fingertips near the camera splash waves through the characters">
      {(video) => <Scene video={video} paused={paused} />}
    </WebcamGate>
  )
}

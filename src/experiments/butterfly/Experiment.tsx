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
import { drawDimWebcam } from '../_shared/asciiTools'

// ── constants ──────────────────────────────────────────────────
const INDEX_TIP = 8          // MediaPipe landmark: index fingertip
const CELL_W = 6             // character cell width (px)
const CELL_H = 10            // character cell height (px)
const APPROACH_SPEED = 80    // px/s toward finger
const PERCH_DIST = 22        // px — snaps to finger when this close
const FLOAT_SPEED = 0.007    // radians/frame for idle drift
const WING_SPEED_FLOAT = 4.8 // radians/s while flying
const WING_SPEED_PERCH = 1.1 // radians/s while perched

// ── monochrome density → grey ─────────────────────────────────
function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
// dense core → near-white, sparse edge → mid-grey
function grey(v: number) {
  const l = Math.round(90 + 154 * clamp01(v))
  return `rgb(${l},${l},${l})`
}

// [row, col, char, colorIdx, isStatic?]
// row/col relative to body centre; negative col = left side
type Cell = [number, number, string, number, boolean?]

// density ramp (sparse → dense) — wing cells pick a glyph from this each frame
// based on lighting + depth + flap, so the butterfly shimmers as it moves.
const RAMP = ' .·:;-~=+*coOS%#H@'

// base density per colour role → where each cell sits on the ramp before
// it is modulated by the live depth/flap of the wing.
function baseDensity(ci: number) {
  switch (ci) {
    case 3: return 1.0 // eyespot
    case 7: return 0.92 // accent
    case 0: return 0.8 // bright outline
    case 4: return 0.68 // light edge
    case 6: return 0.52 // vein
    case 1: return 0.32 // membrane
    case 2: return 0.18 // dark
    default: return 0.5
  }
}

// ── left-side wing definitions (mirrored for right) ────────────
// Line-art wings: orange outline, sparse dotted fill, yellow eye spots
// Upper (fore) wing — rounded triangle with veins, membrane stipple, eye spot
const UPPER_L: Cell[] = [
  [-6, -3, '.', 0], [-6, -4, '-', 0], [-6, -5, '-', 0], [-6, -6, '.', 0],
  [-5, -2, '/', 0], [-5, -3, ',', 1], [-5, -4, '·', 1], [-5, -5, '·', 1], [-5, -6, '~', 0], [-5, -7, '.', 0],
  [-4, -1, '/', 0], [-4, -2, '·', 1], [-4, -3, 'O', 3], [-4, -4, '·', 1], [-4, -5, ':', 6], [-4, -6, '·', 1], [-4, -7, '(', 0], [-4, -8, '.', 0],
  [-3, -1, '|', 0], [-3, -2, ':', 6], [-3, -3, 'O', 3], [-3, -4, '·', 1], [-3, -5, '·', 1], [-3, -6, ':', 6], [-3, -7, '(', 0],
  [-2, -1, '|', 0], [-2, -2, '·', 1], [-2, -3, ':', 6], [-2, -4, '·', 1], [-2, -5, '·', 1], [-2, -6, ')', 0],
  [-1, -1, '|', 0], [-1, -2, '`', 0], [-1, -3, '-', 0], [-1, -4, '·', 1], [-1, -5, "'", 0],
]

// Lower (hind) wing — smaller lobe with a scalloped tail
const LOWER_L: Cell[] = [
  [1, -1, '|', 0], [1, -2, '·', 1], [1, -3, '·', 1], [1, -4, '-', 0], [1, -5, '.', 0],
  [2, -1, '|', 0], [2, -2, ':', 6], [2, -3, 'O', 3], [2, -4, '·', 1], [2, -5, ')', 0],
  [3, -1, '\\', 0], [3, -2, '·', 1], [3, -3, ':', 6], [3, -4, ')', 0],
  [4, -2, '\\', 0], [4, -3, '_', 0], [4, -4, "'", 0],
  [5, -3, '`', 0],
]

// Antennae — curve out from the head, bright club tip
const ANT_L: Cell[] = [
  [-8, -1, '/', 5, true],
  [-9, -2, '~', 5, true],
  [-9, -3, '*', 7, true],
]

// Segmented body — head, furry thorax, tapering abdomen
const BODY_C: Cell[] = [
  [-7, 0, '@', 5, true],
  [-6, 0, '8', 5, true], [-5, 0, '8', 5, true], [-4, 0, '8', 5, true],
  [-3, 0, '8', 5, true], [-2, 0, '#', 5, true], [-1, 0, '#', 5, true],
  [0, 0, '#', 5, true], [1, 0, '8', 5, true], [2, 0, 'o', 5, true], [3, 0, '.', 5, true],
]

function mirrorCells(cells: Cell[]): Cell[] {
  return cells.map(([r, c, ch, ci, s]) => [
    r, -c,
    ch === '/' ? '\\' : ch === '\\' ? '/' : ch === '(' ? ')' : ch === ')' ? '(' : ch,
    ci, s,
  ])
}

// Full sprite, sorted by colorIdx so fillStyle changes are batched (8 total)
const SPRITE: Cell[] = [
  ...UPPER_L, ...mirrorCells(UPPER_L),
  ...LOWER_L, ...mirrorCells(LOWER_L),
  ...ANT_L,   ...mirrorCells(ANT_L),
  ...BODY_C,
].sort((a, b) => a[3] - b[3])

// ── butterfly state ────────────────────────────────────────────
interface Bfly {
  x: number; y: number
  vx: number; vy: number
  floatPhase: number
  wingPhase: number
  heading: number   // radians, direction of travel
  bank: number      // roll around body axis (leaning into turns)
  perched: boolean
  prevTime: number
}

function makeBfly(w: number, h: number): Bfly {
  return {
    x: w / 2, y: h * 0.35, vx: 0, vy: 0,
    floatPhase: 0, wingPhase: 0,
    heading: -Math.PI / 2, bank: 0,
    perched: false, prevTime: 0,
  }
}

// ── rendering ─────────────────────────────────────────────────

// Reusable projection buffer to avoid per-frame allocation
interface ProjCell {
  x: number; y: number; z: number
  ch: string; ci: number; s: number
  d: number // base density on the ramp
  st: boolean // static (body/antenna) → keep its structural glyph
  ph: number // phase seed for shimmer
}
const PROJ: ProjCell[] = SPRITE.map(() => ({ x: 0, y: 0, z: 0, ch: '', ci: 0, s: 1, d: 0.5, st: false, ph: 0 }))

const FOCAL = 320 // perspective focal length (px)

function drawBfly(ctx: CanvasRenderingContext2D, b: Bfly) {
  // Wings fold up out of the body plane (true 3D flap, like a real butterfly)
  const flap = 0.1 + 1.2 * (0.5 + 0.5 * Math.cos(b.wingPhase))
  const pitch = b.perched ? 0.25 : 0.55 // lean the body away from the viewer for depth
  const yaw = b.heading + Math.PI / 2   // sprite head points -y locally

  const cosF = Math.cos(flap), sinF = Math.sin(flap)
  const cosB = Math.cos(b.bank), sinB = Math.sin(b.bank)
  const cosP = Math.cos(pitch), sinP = Math.sin(pitch)
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw)

  for (let i = 0; i < SPRITE.length; i++) {
    const [row, col, char, ci, isStatic] = SPRITE[i]
    let x = col * CELL_W
    const y0 = row * CELL_H
    let z = 0
    if (!isStatic) {
      // fold wing around the body (local y) axis
      z = -Math.abs(x) * sinF
      x = x * cosF
    }
    // bank: roll around body axis (lean into turns)
    const xb = x * cosB + z * sinB
    const zb = -x * sinB + z * cosB
    // pitch: tilt around local x axis
    const yp = y0 * cosP - zb * sinP
    const zp = y0 * sinP + zb * cosP
    // yaw: face the direction of travel (screen-plane rotation)
    const X = xb * cosY - yp * sinY
    const Y = xb * sinY + yp * cosY
    // perspective projection
    const s = FOCAL / (FOCAL + zp)
    const p = PROJ[i]
    p.x = b.x + X * s
    p.y = b.y + Y * s
    p.z = zp
    p.ch = char
    p.ci = ci
    p.s = s
    p.st = !!isStatic
    p.d = baseDensity(ci)
    p.ph = i
  }

  // painter's order: far cells first so near wing overlaps body correctly
  PROJ.sort((a, c) => c.z - a.z)

  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  let lastSize = -1
  const ramp = RAMP.length - 1
  for (const p of PROJ) {
    // quantize size so font string changes are rare
    const size = Math.max(6, Math.round(CELL_H * p.s))
    if (size !== lastSize) {
      ctx.font = `${size}px ui-monospace, monospace`
      lastSize = size
    }
    // depth from perspective scale: front cells are brighter/denser
    const depth01 = Math.max(0, Math.min(1, (p.s - 0.86) / 0.34))
    let ch = p.ch
    let alpha = 1
    if (!p.st) {
      // live glyph: density follows depth + a flap-driven shimmer, so the
      // character morphs as the butterfly banks, turns and flaps
      const shimmer = 0.14 * Math.sin(b.wingPhase * 1.6 + p.ph)
      const value = Math.max(0, Math.min(1, p.d * (0.5 + 0.5 * depth01) + shimmer))
      ch = RAMP[Math.round(value * ramp)]
      alpha = 0.6 + 0.4 * depth01
    }
    const px = Math.round(p.x), py = Math.round(p.y)
    ctx.globalAlpha = alpha
    // dark backing for legibility over the bright camera
    ctx.fillStyle = 'rgba(0,0,0,0.78)'
    ctx.fillText(ch, px + 1, py + 1)
    // monochrome: brightness follows the same value that picked the glyph
    ctx.fillStyle = grey(p.st ? 0.85 : p.d * (0.5 + 0.5 * depth01))
    ctx.fillText(ch, px, py)
  }
  ctx.globalAlpha = 1
  ctx.restore()
}

// ── scene ─────────────────────────────────────────────────────

function Scene({ video, paused }: { video: HTMLVideoElement } & ExperimentProps) {
  const { canvasRef, ctxRef, sizeRef } = useCanvas2D()
  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const lastDetect = useRef(0)
  const indexTips = useRef<{ x: number; y: number }[]>([])
  const bflyRef = useRef<Bfly | null>(null)
  const { audioRef, muted, toggleMuted } = useGlassAudio(paused)
  const nextBell = useRef(0)
  const nextSparkle = useRef(0)
  const wasPerched = useRef(false)


  useEffect(() => {
    let alive = true
    void createHandLandmarker(2).then((lm) => {
      if (alive) landmarkerRef.current = lm
      else lm.close()
    })
    return () => {
      alive = false
      landmarkerRef.current?.close()
      landmarkerRef.current = null
    }
  }, [])

  useAnimationLoop(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    const { width, height } = sizeRef.current
    if (!width || !height) return
    const now = performance.now()

    if (!bflyRef.current) bflyRef.current = makeBfly(width, height)
    const b = bflyRef.current

    // Hand detection at ~30fps. Gate on the video actually having decoded
    // frames (videoWidth) — readyState alone can lie before first frame.
    const lm = landmarkerRef.current
    if (
      lm &&
      video.readyState >= 2 &&
      video.videoWidth > 0 &&
      now - lastDetect.current > 33
    ) {
      // MediaPipe requires strictly-increasing timestamps
      const ts = now > lastDetect.current ? now : lastDetect.current + 1
      lastDetect.current = ts
      const res = lm.detectForVideo(video, ts)
      indexTips.current = res.landmarks.map((hand) => {
        const t = hand[INDEX_TIP]
        // mirror x to match the mirrored (-scale-x-100) video
        return { x: (1 - t.x) * width, y: t.y * height }
      })
    }

    // dt, clamped to avoid spiral on tab-hidden reactivation
    const dt = b.prevTime ? Math.min((now - b.prevTime) / 1000, 0.05) : 0.016
    b.prevTime = now

    // Find nearest index fingertip
    const tips = indexTips.current
    let nearest: { x: number; y: number } | null = null
    let nearestDist = Infinity
    for (const t of tips) {
      const d = Math.hypot(t.x - b.x, t.y - b.y)
      if (d < nearestDist) { nearestDist = d; nearest = t }
    }

    // ── sound ──
    const audio = audioRef.current
    if (audio) {
      // landing / take-off moments
      if (b.perched && !wasPerched.current) {
        // lush glass chord on landing
        audio.chord(GLASS_SCALE[1], { bright: 0.9, dur: 4.2, gain: 0.6, pan: (b.x / width) * 2 - 1 })
        audio.setPadBrightness(0.15)
      } else if (!b.perched && wasPerched.current) {
        audio.flourish(true) // take-off
        audio.chord(GLASS_SCALE[3], { bright: 0.7, dur: 3, gain: 0.35, pan: (b.x / width) * 2 - 1 })
        audio.setPadBrightness(0.6)
      }
      wasPerched.current = b.perched

      // generative bells: rate & brightness depend on state
      if (now > nextBell.current) {
        const pan = (b.x / width) * 2 - 1
        const altitude = 1 - b.y / height // higher on screen → higher notes
        if (b.perched) {
          // sparse, low, soft — "purring"
          const f = GLASS_SCALE[Math.floor(Math.random() * 2)] / 2
          audio.bell(f, { bright: 0.15, dur: 4, gain: 0.3, pan })
          nextBell.current = now + 2400 + Math.random() * 2600
        } else if (nearest) {
          // approaching: faster, brighter, gliding up
          const idx = Math.min(5, 2 + Math.floor((1 - nearestDist / width) * 4))
          audio.bell(GLASS_SCALE[idx], { bright: 1.0, dur: 1.2, gain: 0.45, pan })
          nextBell.current = now + 350 + Math.random() * 350
        } else {
          // idle drift: unhurried, altitude-tinted
          const idx = Math.min(5, Math.floor(altitude * 4) + Math.floor(Math.random() * 2))
          audio.bell(GLASS_SCALE[idx], { bright: 0.5, dur: 2.6, gain: 0.4, pan })
          nextBell.current = now + 900 + Math.random() * 1400
        }
      }

      // digital sparkles riding inside the reverb, denser while flying
      if (now > nextSparkle.current && !b.perched) {
        audio.sparkle((b.x / width) * 2 - 1)
        nextSparkle.current = now + 250 + Math.random() * 700
      }
    }

    // Motion update
    const prevX = b.x
    const prevY = b.y
    if (b.perched) {
      if (nearest) {
        b.x = nearest.x
        b.y = nearest.y
      } else {
        b.perched = false
        b.vy = -80
      }
      b.wingPhase += WING_SPEED_PERCH * dt
    } else if (nearest) {
      if (nearestDist < PERCH_DIST) {
        b.perched = true
        b.x = nearest.x
        b.y = nearest.y
        b.vx = b.vy = 0
      } else {
        const spd = APPROACH_SPEED * dt
        b.x += ((nearest.x - b.x) / nearestDist) * spd
        b.y += ((nearest.y - b.y) / nearestDist) * spd
      }
      b.wingPhase += WING_SPEED_FLOAT * 1.4 * dt
    } else {
      // Lissajous-like idle float
      b.floatPhase += FLOAT_SPEED
      const tx = width  * 0.5  + Math.sin(b.floatPhase * 0.71) * width  * 0.28
      const ty = height * 0.38 + Math.cos(b.floatPhase)         * height * 0.18
      b.vx += (tx - b.x) * 0.005
      b.vy += (ty - b.y) * 0.005
      b.vx *= 0.94
      b.vy *= 0.94
      b.x += b.vx
      b.y += b.vy
      b.wingPhase += WING_SPEED_FLOAT * dt
    }

    // Orientation: face the direction of travel, bank into turns
    const mdx = b.x - prevX
    const mdy = b.y - prevY
    if (!b.perched && Math.hypot(mdx, mdy) > 0.4) {
      const target = Math.atan2(mdy, mdx)
      let dh = target - b.heading
      dh = Math.atan2(Math.sin(dh), Math.cos(dh))
      b.heading += dh * Math.min(1, 6 * dt)
      const bankTarget = Math.max(-0.9, Math.min(0.9, dh * 3))
      b.bank += (bankTarget - b.bank) * Math.min(1, 4 * dt)
    } else {
      // settle upright (head up) when perched or hovering
      let dh = -Math.PI / 2 - b.heading
      dh = Math.atan2(Math.sin(dh), Math.cos(dh))
      b.heading += dh * Math.min(1, 3 * dt)
      b.bank -= b.bank * Math.min(1, 4 * dt)
    }

    // Draw — full-brightness webcam (no darkening)
    if (video.readyState >= 2 && video.videoWidth > 0) {
      drawDimWebcam(ctx, video, width, height, 1)
    } else {
      ctx.fillStyle = '#07080a'
      ctx.fillRect(0, 0, width, height)
    }

    // Fingertip landmark — a single clean glowing green dot
    const pulse = 0.6 + 0.4 * Math.sin(now / 180)
    for (const t of tips) {
      ctx.save()
      ctx.shadowColor = '#39ff14'
      ctx.shadowBlur = 12 * pulse
      ctx.fillStyle = `rgba(57,255,20,${0.8 + 0.2 * pulse})`
      ctx.beginPath()
      ctx.arc(t.x, t.y, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    drawBfly(ctx, b)
  }, paused)

  return (
    <div
      className="relative h-full w-full"
      onPointerDown={() => audioRef.current?.resume()}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />
      <SoundToggle muted={muted} onToggle={toggleMuted} />
    </div>
  )
}

export default function Butterfly({ paused }: ExperimentProps) {
  return (
    <WebcamGate hint="index fingers tracked — a butterfly drifts around and perches on your fingertip">
      {(video) => <Scene video={video} paused={paused} />}
    </WebcamGate>
  )
}

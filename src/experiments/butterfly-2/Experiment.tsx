import { useEffect, useRef } from 'react'
import type { HandLandmarker, ImageSegmenter } from '@mediapipe/tasks-vision'
import type { ExperimentProps } from '@/shared/types'
import { useCanvas2D } from '@/shared/hooks/useCanvas2D'
import { useAnimationLoop } from '@/shared/hooks/useAnimationLoop'
import { WebcamGate } from '@/shared/components/WebcamGate'
import {
  createHandLandmarker,
  createImageSegmenter,
} from '@/shared/lib/mediapipe'
import { GLASS_SCALE } from '@/shared/lib/glassAudio'
import { useGlassAudio } from '@/shared/hooks/useGlassAudio'
import { SoundToggle } from '@/shared/components/SoundToggle'
import { drawDimWebcam } from '../_shared/asciiTools'
import type { Cell } from './geometry'
import { CELL_H, CELL_W, buildCells, clamp01 } from './geometry'
import {
  ASCII_RAMP,
  computeLuminance,
  edgeStrength,
  glyphIndex,
  maxCornerDistance,
  normalizeLuminance,
  personOpacity,
  transitionRadius,
  waveCoverage,
} from './asciiPortrait'

// ── constants ──────────────────────────────────────────────────
const INDEX_TIP = 8          // MediaPipe landmark: index fingertip
const APPROACH_SPEED = 80    // px/s toward finger
const PERCH_DIST = 22        // px — snaps to finger when this close
const FLOAT_SPEED = 0.007    // radians/frame for idle drift
const WING_SPEED_FLOAT = 4.8 // radians/s while flying
const WING_SPEED_PERCH = 1.1 // radians/s while perched
const ASCII_CELL_W = 7
const ASCII_CELL_H = 12
const WAVE_DURATION = 700
const WAVE_FEATHER = 80

// ── monochrome density → grey ─────────────────────────────────
// dense core → near-white, sparse edge → mid-grey
function grey(v: number) {
  const l = Math.round(90 + 154 * clamp01(v))
  return `rgb(${l},${l},${l})`
}

type VisualMode = 'photo' | 'revealing' | 'ascii' | 'hiding'

interface WaveState {
  mode: VisualMode
  originX: number
  originY: number
  startedAt: number
  startRadius: number
  radius: number
}

interface PersonMask {
  data: Float32Array<ArrayBufferLike> | null
  width: number
  height: number
}

const GREEN_PALETTE = [
  '#0a3c0d',
  '#0c6410',
  '#0f8d12',
  '#14b614',
  '#1bdc14',
  '#39ff14',
  '#75ff55',
  '#b8ffa7',
]

function drawAsciiPortrait(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
  sample: HTMLCanvasElement,
  luminance: Float32Array,
  wave: WaveState,
  mask: PersonMask,
) {
  const cols = Math.max(1, Math.ceil(width / ASCII_CELL_W))
  const rows = Math.max(1, Math.ceil(height / ASCII_CELL_H))
  if (sample.width !== cols || sample.height !== rows) {
    sample.width = cols
    sample.height = rows
  }

  const sampleCtx = sample.getContext('2d', { willReadFrequently: true })
  if (!sampleCtx) return luminance

  sampleCtx.save()
  sampleCtx.setTransform(-1, 0, 0, 1, cols, 0)
  sampleCtx.drawImage(video, 0, 0, cols, rows)
  sampleCtx.restore()

  const pixels = sampleCtx.getImageData(0, 0, cols, rows).data
  if (luminance.length !== cols * rows) {
    luminance = new Float32Array(cols * rows)
  }
  computeLuminance(pixels, luminance)

  const full = wave.mode === 'ascii'
  const cellW = width / cols
  const cellH = height / rows
  const rampLength = ASCII_RAMP.length

  ctx.save()
  if (full) {
    ctx.globalAlpha = 1
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, width, height)
  }
  ctx.font = `${Math.max(9, Math.round(cellH * 0.9))}px ui-monospace, monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  for (let row = 0; row < rows; row++) {
    const cy = (row + 0.5) * cellH
    const maskY = Math.min(
      mask.height - 1,
      Math.floor(((row + 0.5) / rows) * mask.height),
    )
    for (let col = 0; col < cols; col++) {
      const cx = (col + 0.5) * cellW
      const coverage = full
        ? 1
        : waveCoverage(
            cx,
            cy,
            wave.originX,
            wave.originY,
            wave.radius,
            WAVE_FEATHER,
          )
      if (coverage <= 0.01) continue

      if (!full) {
        ctx.globalAlpha = coverage
        ctx.fillStyle = '#000'
        ctx.fillRect(col * cellW, row * cellH, cellW + 0.5, cellH + 0.5)
      }

      if (!mask.data || mask.width <= 0 || mask.height <= 0) continue
      const maskX = Math.min(
        mask.width - 1,
        Math.floor((1 - (col + 0.5) / cols) * mask.width),
      )
      const person = personOpacity(mask.data[maskY * mask.width + maskX])
      if (person <= 0.01) continue

      const i = row * cols + col
      const value = normalizeLuminance(luminance[i])
      const edge = edgeStrength(luminance, col, row, cols, rows)
      const portraitValue = clamp01(value * 0.9 + person * 0.1)
      if (portraitValue < 0.035 && edge < 0.08) continue

      const char = ASCII_RAMP[glyphIndex(portraitValue, edge, rampLength)]
      if (char === ' ') continue

      const intensity = clamp01(portraitValue + edge * 0.18)
      const paletteIndex = Math.min(
        GREEN_PALETTE.length - 1,
        Math.round(intensity * (GREEN_PALETTE.length - 1)),
      )
      ctx.globalAlpha =
        coverage *
        person *
        (0.48 + 0.52 * Math.max(portraitValue, edge * 0.8))
      ctx.fillStyle = GREEN_PALETTE[paletteIndex]
      ctx.fillText(char, cx, cy)
    }
  }

  ctx.restore()
  return luminance
}

// density ramp (sparse → dense) — wing cells pick a glyph from this each frame
// based on lighting + depth + flap, so the butterfly shimmers as it moves.
const RAMP = ' .·:;-~=+*coOS%#H@'

const CELLS: Cell[] = buildCells()

// ── pollen particles ──────────────────────────────────────────
const MAX_PARTICLES = 60
const POLLEN_GLYPHS = '·.:˚*'
interface Particle {
  x: number; y: number; vx: number; vy: number
  life: number; max: number; ch: string; on: boolean
}
const PARTICLES: Particle[] = Array.from({ length: MAX_PARTICLES }, () => ({
  x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, ch: '·', on: false,
}))

function emitPollen(x: number, y: number) {
  const p = PARTICLES.find((q) => !q.on)
  if (!p) return
  p.on = true
  p.x = x
  p.y = y
  p.vx = (Math.random() - 0.5) * 18
  p.vy = 12 + Math.random() * 22
  p.max = 0.8 + Math.random() * 0.6
  p.life = p.max
  p.ch = POLLEN_GLYPHS[Math.floor(Math.random() * POLLEN_GLYPHS.length)]
}

function drawParticles(ctx: CanvasRenderingContext2D, dt: number) {
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '10px ui-monospace, monospace'
  for (const p of PARTICLES) {
    if (!p.on) continue
    p.life -= dt
    if (p.life <= 0) { p.on = false; continue }
    p.vy += 30 * dt // gravity
    p.x += p.vx * dt
    p.y += p.vy * dt
    const a = p.life / p.max
    ctx.globalAlpha = a * 0.7
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillText(p.ch, p.x + 1, p.y + 1)
    ctx.fillStyle = grey(0.5 + 0.3 * a)
    ctx.fillText(p.ch, p.x, p.y)
  }
  ctx.globalAlpha = 1
  ctx.restore()
}

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
  glideUntil: number // performance.now() ms until which the butterfly coasts
  flapAmp: number    // current flap amplitude (eased 0..1)
  wander: number     // accumulated heading-wander angle
}

function makeBfly(w: number, h: number): Bfly {
  return {
    x: w / 2, y: h * 0.35, vx: 0, vy: 0,
    floatPhase: 0, wingPhase: 0,
    heading: -Math.PI / 2, bank: 0,
    perched: false, prevTime: 0,
    glideUntil: 0, flapAmp: 1, wander: 0,
  }
}

// ── rendering ─────────────────────────────────────────────────

// Reusable projection buffer to avoid per-frame allocation
interface ProjCell {
  x: number; y: number; z: number
  ch: string; s: number
  d: number // base density on the ramp
  st: boolean // static (body/antenna) → keep its structural glyph
  vein: boolean // wing vein → holds steady while the membrane shimmers
  iri: boolean // iridescent patch → exaggerated sheen
  ph: number // phase seed for shimmer
}
const PROJ: ProjCell[] = CELLS.map(() => ({
  x: 0, y: 0, z: 0, ch: '', s: 1, d: 0.5, st: false, vein: false, iri: false, ph: 0,
}))

const FOCAL = 320 // perspective focal length (px)

// updated by drawBfly each frame: outermost projected wing-tip positions
const WING_TIP_L = { x: 0, y: 0 }
const WING_TIP_R = { x: 0, y: 0 }

function drawBfly(ctx: CanvasRenderingContext2D, b: Bfly, t: number) {
  // Wings fold up out of the body plane (true 3D flap, like a real butterfly).
  // Non-sinusoidal: downstroke sharper than upstroke; amplitude eased by state.
  const shaped = b.wingPhase + 0.4 * Math.sin(b.wingPhase)
  const flapBase = 0.1 + (0.25 + 1.05 * b.flapAmp) * (0.5 + 0.5 * Math.cos(shaped))
  const pitch = b.perched ? 0.25 : 0.55 // lean the body away from the viewer for depth
  const yaw = b.heading + Math.PI / 2   // sprite head points -y locally

  const cosB = Math.cos(b.bank), sinB = Math.sin(b.bank)
  const cosP = Math.cos(pitch), sinP = Math.sin(pitch)
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw)

  for (let i = 0; i < CELLS.length; i++) {
    const cell = CELLS[i]
    let x = cell.col * CELL_W
    const y0 = cell.row * CELL_H
    let z = 0
    if (!cell.st) {
      // fold wing around the body (local y) axis; left wing slightly leads right
      const sideOffset = cell.col < 0 ? 0 : 0.18
      const f = flapBase + sideOffset * Math.cos(shaped)
      const cf = Math.cos(f), sf = Math.sin(f)
      z = -Math.abs(x) * sf
      x = x * cf
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
    p.ch = cell.ch
    p.s = s
    p.st = cell.st
    p.d = cell.d
    p.vein = cell.vein
    p.iri = cell.iri
    p.ph = i
  }

  // find outermost projected cells = wing tips (for pollen emission)
  let minX = Infinity, maxX = -Infinity
  for (let i = 0; i < PROJ.length; i++) {
    const p = PROJ[i]
    if (p.x < minX) { minX = p.x; WING_TIP_L.x = p.x; WING_TIP_L.y = p.y }
    if (p.x > maxX) { maxX = p.x; WING_TIP_R.x = p.x; WING_TIP_R.y = p.y }
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
      // live glyph: density follows depth + shimmer + per-cell jitter, so the
      // character morphs as the butterfly banks, turns and flaps. Veins are
      // skeleton — they barely churn, which keeps the wing structure readable;
      // the iridescent hindwing patch churns hardest and reads as a sheen.
      // morph driven by wall-clock time → symbol churn independent of flap
      const amp = p.vein ? 0.05 : p.iri ? 0.26 : 0.16
      const shimmer = amp * Math.sin(t * 0.012 + p.ph * 1.7)
      const noise = (p.vein ? 0.02 : 0.09) * Math.sin(t * 0.021 + p.ph * 12.9898)
      const value = clamp01(p.d * (0.5 + 0.5 * depth01) + shimmer + noise)
      ch = RAMP[Math.round(value * ramp)]
      alpha = clamp01((p.vein ? 0.75 : 0.55) + 0.45 * depth01)
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
  const sampleRef = useRef(document.createElement('canvas'))
  const luminanceRef = useRef<Float32Array<ArrayBufferLike>>(
    new Float32Array(0),
  )
  const waveRef = useRef<WaveState>({
    mode: 'photo',
    originX: 0,
    originY: 0,
    startedAt: 0,
    startRadius: 0,
    radius: 0,
  })
  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const segmenterRef = useRef<ImageSegmenter | null>(null)
  const personMaskRef = useRef<PersonMask>({
    data: null,
    width: 0,
    height: 0,
  })
  const lastDetect = useRef(0)
  const lastSegment = useRef(0)
  const indexTips = useRef<{ x: number; y: number }[]>([])
  const bflyRef = useRef<Bfly | null>(null)
  const { audioRef, muted, toggleMuted } = useGlassAudio(paused)
  const nextBell = useRef(0)
  const nextSparkle = useRef(0)
  const wasPerched = useRef(false)
  const transitionPerched = useRef(false)
  const prevFlap = useRef(0)

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

  useEffect(() => {
    let alive = true
    void createImageSegmenter().then((segmenter) => {
      if (alive) segmenterRef.current = segmenter
      else segmenter.close()
    })
    return () => {
      alive = false
      segmenterRef.current?.close()
      segmenterRef.current = null
      personMaskRef.current.data = null
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

    // Keep a warm person mask so the landing wave can reveal the silhouette
    // immediately. 12.5fps is enough for a soft mask and leaves GPU room for
    // hand tracking and the 60fps glyph render.
    const segmenter = segmenterRef.current
    if (
      segmenter &&
      video.readyState >= 2 &&
      video.videoWidth > 0 &&
      now - lastSegment.current > 80
    ) {
      const ts = now > lastSegment.current ? now : lastSegment.current + 1
      lastSegment.current = ts
      segmenter.segmentForVideo(video, ts, (result) => {
        const confidence = result.confidenceMasks?.[0]
        if (!confidence) return
        const source = confidence.getAsFloat32Array()
        const mask = personMaskRef.current
        if (!mask.data || mask.data.length !== source.length) {
          mask.data = new Float32Array(source.length)
        }
        mask.data.set(source)
        mask.width = confidence.width
        mask.height = confidence.height
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

    // glide phases: occasionally stop flapping and coast for ~0.6–1.2 s
    if (!b.perched && !nearest && now > b.glideUntil && Math.random() < 0.004) {
      b.glideUntil = now + 600 + Math.random() * 600
    }
    const gliding = !b.perched && !nearest && now < b.glideUntil
    const ampTarget = b.perched ? 0.25 : gliding ? 0.12 : 1
    b.flapAmp += (ampTarget - b.flapAmp) * Math.min(1, 3 * dt)

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
      // wandering idle drift: smooth-noise heading offset breaks the clean orbit
      b.floatPhase += FLOAT_SPEED
      b.wander += (Math.sin(b.floatPhase * 1.7) + Math.sin(b.floatPhase * 0.43)) * 0.5 * dt
      const wob = b.wander * 0.6
      const tx = width * 0.5 + Math.sin(b.floatPhase * 0.71 + wob) * width * 0.28
      const ty = height * 0.38 + Math.cos(b.floatPhase + wob) * height * 0.18
      b.vx += (tx - b.x) * 0.005
      b.vy += (ty - b.y) * 0.005
      b.vx *= 0.94
      b.vy *= 0.94
      b.x += b.vx
      b.y += b.vy
      b.wingPhase += WING_SPEED_FLOAT * (gliding ? 0.15 : 1) * dt
      // flap-coupled vertical bob — butterfly lifts on each beat
      b.y += Math.sin(b.wingPhase) * 1.4 * b.flapAmp
    }

    // Landing releases the ASCII field from the fingertip. Losing the finger
    // collapses from the current radius, so a brief early takeoff never jumps.
    const wave = waveRef.current
    if (b.perched && !transitionPerched.current) {
      wave.mode = 'revealing'
      wave.originX = b.x
      wave.originY = b.y
      wave.startedAt = now
      wave.startRadius = wave.radius
    } else if (!b.perched && transitionPerched.current) {
      wave.mode = 'hiding'
      wave.startedAt = now
      wave.startRadius = wave.radius
    }
    transitionPerched.current = b.perched

    const maxRadius = maxCornerDistance(
      wave.originX,
      wave.originY,
      width,
      height,
    )
    if (wave.mode === 'revealing' || wave.mode === 'hiding') {
      const elapsed = now - wave.startedAt
      wave.radius = transitionRadius(
        wave.mode,
        elapsed,
        WAVE_DURATION,
        maxRadius,
        wave.startRadius,
      )
      if (elapsed >= WAVE_DURATION) {
        wave.mode = wave.mode === 'revealing' ? 'ascii' : 'photo'
        wave.radius = wave.mode === 'ascii' ? maxRadius : 0
      }
    } else if (wave.mode === 'ascii') {
      wave.radius = maxRadius
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
      if (wave.mode !== 'photo') {
        luminanceRef.current = drawAsciiPortrait(
          ctx,
          video,
          width,
          height,
          sampleRef.current,
          luminanceRef.current,
          wave,
          personMaskRef.current,
        )
      }
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

    drawBfly(ctx, b, now)

    // emit pollen near the peak of each downstroke (when not perched)
    const flapSin = Math.sin(b.wingPhase)
    if (!b.perched && prevFlap.current <= 0.85 && flapSin > 0.85 && b.flapAmp > 0.5) {
      emitPollen(WING_TIP_L.x, WING_TIP_L.y)
      emitPollen(WING_TIP_R.x, WING_TIP_R.y)
    }
    prevFlap.current = flapSin
    drawParticles(ctx, dt)
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

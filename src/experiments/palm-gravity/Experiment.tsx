import { useEffect, useRef } from 'react'
import type { HandLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { ExperimentProps } from '@/shared/types'
import { WebcamGate } from '@/shared/components/WebcamGate'
import { useAnimationLoop } from '@/shared/hooks/useAnimationLoop'
import { useCanvas2D } from '@/shared/hooks/useCanvas2D'
import { createHandLandmarker } from '@/shared/lib/mediapipe'
import { GLASS_SCALE } from '@/shared/lib/glassAudio'
import { useGlassAudio } from '@/shared/hooks/useGlassAudio'
import { SoundToggle } from '@/shared/components/SoundToggle'

const QUOTES = [
  [
    'Aristotle',
    'Knowing yourself is the beginning',
    'of all wisdom.',
  ],
  [
    'Heraclitus',
    'No one steps in the same river twice,',
    'for it is not the same river',
    'and they are not the same person.',
  ],
  [
    'Spinoza',
    'The mind is not a kingdom',
    'within a kingdom.',
  ],
  [
    'Kant',
    'Thoughts without content are empty;',
    'intuitions without concepts are blind.',
  ],
  [
    'Nietzsche',
    'One must still have chaos in oneself',
    'to give birth to a dancing star.',
  ],
  [
    'Simone Weil',
    'Attention is the rarest',
    'and purest form of generosity.',
  ],
  [
    'Wittgenstein',
    'The limits of my language',
    'mean the limits of my world.',
  ],
  [
    'Hannah Arendt',
    'To think and to be fully alive',
    'are the same.',
  ],
  [
    'Foucault',
    'Where there is power,',
    'there is resistance.',
  ],
  [
    'Deleuze',
    'A concept is a brick.',
    'It can be used to build',
    'a courthouse of reason.',
  ],
]

// Quotes deserve a real typeface — elegant italic serif, not monospace.
const quoteFont = (size: number) => `italic ${size}px 'Instrument Serif', Georgia, serif`

type TextPoint = {
  char: string
  x: number
  y: number
}

type Particle = {
  char: string
  x: number
  y: number
  px: number
  py: number
  vx: number
  vy: number
  homeX: number
  homeY: number
  nextX: number
  nextY: number
  orbit: number
  angle: number
  spin: number
  heat: number
  swallowed: number
}

type HandState = {
  seen: boolean
  openness: number
  open: boolean
  fist: boolean
  x: number
  y: number
}

const TIP_IDS = [8, 12, 16, 20]
const PIP_IDS = [6, 10, 14, 18]

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function layoutQuote(ctx: CanvasRenderingContext2D, lines: string[], width: number, height: number) {
  const maxWidth = width * 0.85
  const fontFor = quoteFont

  // Start from a comfortable size, then shrink until the longest line fits maxWidth.
  let fontSize = clamp(Math.round(width / 36), 18, 34)
  for (; fontSize >= 9; fontSize--) {
    ctx.font = fontFor(fontSize)
    const longest = lines.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0)
    if (longest <= maxWidth) break
  }
  ctx.font = fontFor(fontSize)

  const lineHeight = fontSize * 1.7
  const points: TextPoint[] = []
  const startY = Math.round(height * 0.5 - (lines.length * lineHeight) / 2)

  lines.forEach((line, row) => {
    // Center each line independently; never clamp width so it can't visually wrap/clip.
    const x0 = Math.round(width * 0.5 - ctx.measureText(line).width / 2)
    const y = startY + row * lineHeight
    let x = x0
    for (const char of line) {
      points.push({ char, x, y })
      x += ctx.measureText(char).width
    }
  })

  return { points, fontSize, lineHeight }
}

function readHandState(hand: NormalizedLandmark[] | undefined, width: number, height: number): HandState {
  if (!hand) {
    return { seen: false, openness: 0, open: false, fist: false, x: width * 0.5, y: height * 0.5 }
  }

  const palm = hand[0]
  const middleBase = hand[9]
  const palmSize = Math.hypot((palm.x - middleBase.x) * width, (palm.y - middleBase.y) * height) || 1
  let extension = 0

  for (let i = 0; i < TIP_IDS.length; i++) {
    const tip = hand[TIP_IDS[i]]
    const pip = hand[PIP_IDS[i]]
    const tipDist = Math.hypot((tip.x - palm.x) * width, (tip.y - palm.y) * height)
    const pipDist = Math.hypot((pip.x - palm.x) * width, (pip.y - palm.y) * height)
    extension += clamp((tipDist - pipDist) / (palmSize * 0.62), 0, 1)
  }

  const openness = extension / TIP_IDS.length
  return {
    seen: true,
    openness,
    open: openness > 0.58,
    fist: openness < 0.24,
    x: (1 - palm.x) * width,
    y: palm.y * height,
  }
}

function ensureParticles(particles: Particle[], current: TextPoint[], next: TextPoint[], width: number, height: number) {
  const total = Math.min(current.length, next.length)
  if (particles.length === total) return

  particles.length = 0
  for (let i = 0; i < total; i++) {
    const a = current[i]
    const b = next[i]
    const spread = Math.min(width, height)
    particles.push({
      char: a.char,
      x: a.x,
      y: a.y,
      px: a.x,
      py: a.y,
      vx: 0,
      vy: 0,
      homeX: a.x,
      homeY: a.y,
      nextX: b.x,
      nextY: b.y,
      orbit: spread * (0.08 + Math.random() * 0.44),
      angle: Math.random() * Math.PI * 2,
      spin: 0.7 + Math.random() * 1.8,
      heat: Math.random(),
      swallowed: 0,
    })
  }
}

function swapPoems(particles: Particle[]) {
  for (const particle of particles) {
    const homeX = particle.homeX
    const homeY = particle.homeY
    particle.homeX = particle.nextX
    particle.homeY = particle.nextY
    particle.nextX = homeX
    particle.nextY = homeY
    particle.vx += (Math.random() - 0.5) * 18
    particle.vy += (Math.random() - 0.72) * 22
    particle.swallowed = Math.min(particle.swallowed, 0.42)
  }
}

function randomQuotePair() {
  const a = Math.floor(Math.random() * QUOTES.length)
  let b = Math.floor(Math.random() * QUOTES.length)
  if (b === a) b = (b + 1) % QUOTES.length
  return [QUOTES[a], QUOTES[b]]
}

// deterministic [0,1) hash so the starfield is stable frame-to-frame
function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

const STAR_COUNT = 170

function drawBackground(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
  elapsed: number,
) {
  if (video.readyState >= 2 && video.videoWidth > 0) {
    ctx.save()
    ctx.translate(width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0, width, height)
    ctx.restore()

    const shade = ctx.createLinearGradient(0, 0, width, height)
    shade.addColorStop(0, 'rgba(0,0,0,0.18)')
    shade.addColorStop(0.55, 'rgba(0,0,0,0.34)')
    shade.addColorStop(1, 'rgba(0,0,0,0.42)')
    ctx.fillStyle = shade
    ctx.fillRect(0, 0, width, height)
  } else {
    ctx.fillStyle = '#08070d'
    ctx.fillRect(0, 0, width, height)
  }

  // Faint colour nebula clouds over the real webcam.
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const neb = (cx: number, cy: number, r: number, col: string) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    g.addColorStop(0, col)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
  }
  neb(width * 0.22, height * 0.28, Math.max(width, height) * 0.4, 'rgba(60,40,120,0.045)')
  neb(width * 0.8, height * 0.7, Math.max(width, height) * 0.45, 'rgba(120,50,40,0.04)')
  ctx.restore()

  // twinkling starfield with depth (parallax-ish size/brightness tiers)
  ctx.save()
  for (let i = 0; i < STAR_COUNT; i++) {
    const x = hash(i) * width
    const y = hash(i + 99.3) * height
    const tier = hash(i + 7.7)
    const twinkle = 0.5 + 0.5 * Math.sin(elapsed * (0.6 + tier * 2.4) + i)
    const r = 0.3 + tier * tier * 1.7
    const a = (0.08 + tier * 0.22) * twinkle
    ctx.fillStyle = `rgba(${220 + Math.round(tier * 35)},${228},${255},${a})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    // a few bright stars get a soft cross-glow
    if (tier > 0.93) {
      ctx.strokeStyle = `rgba(200,220,255,${a * 0.5})`
      ctx.lineWidth = 0.6
      ctx.beginPath()
      ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y)
      ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4)
      ctx.stroke()
    }
  }
  ctx.restore()
}

function drawBlackHole(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  pull: number,
  elapsed: number,
) {
  if (pull <= 0.02) return

  const p = clamp(pull, 0, 1)

  // 1) Soft outer glow / gravitational-lensing shimmer washing the dark sky.
  ctx.save()
  ctx.translate(x, y)
  const wobble = 1 + Math.sin(elapsed * 0.9) * 0.015
  const haloR = radius * 5.2 * wobble
  const halo = ctx.createRadialGradient(0, 0, radius * 0.9, 0, 0, haloR)
  halo.addColorStop(0, 'rgba(0,0,0,0)')
  halo.addColorStop(0.18, `rgba(120,170,255,${0.05 * p})`)
  halo.addColorStop(0.4, `rgba(255,150,70,${0.07 * p})`)
  halo.addColorStop(0.75, `rgba(255,90,30,${0.025 * p})`)
  halo.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(0, 0, haloR, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // 2) Accretion disk: an inclined ring of glowing arcs, additively blended.
  //    Doppler-brightened on one side (rotating), hot-white inner edge -> orange -> dark.
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(-0.42)
  ctx.scale(1, 0.34) // viewing inclination -> ellipse
  ctx.globalCompositeOperation = 'lighter'
  const spin = elapsed * 1.6
  const arcs = 220
  for (let i = 0; i < arcs; i++) {
    const a = (i / arcs) * Math.PI * 2 + spin
    // Doppler: approaching side (cos>0) much brighter.
    const doppler = 0.35 + 0.65 * Math.max(0, Math.cos(a))
    const rr = radius * (1.18 + Math.sin(a * 3 + elapsed) * 0.015)
    const px = Math.cos(a) * rr
    const py = Math.sin(a) * rr
    const g = doppler * p
    ctx.fillStyle = `rgba(255,${Math.round(150 + 90 * doppler)},${Math.round(60 * doppler)},${0.5 * g})`
    ctx.beginPath()
    ctx.arc(px, py, radius * 0.16 * (0.6 + doppler), 0, Math.PI * 2)
    ctx.fill()
  }
  // Hot inner lip of the disk.
  ctx.lineWidth = radius * 0.07
  ctx.strokeStyle = `rgba(255,244,224,${0.7 * p})`
  ctx.beginPath()
  ctx.arc(0, 0, radius * 1.02, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()

  // 3) Photon ring: a thin, bright, perfectly circular ring hugging the horizon.
  ctx.save()
  ctx.translate(x, y)
  ctx.globalCompositeOperation = 'lighter'
  ctx.shadowColor = `rgba(255,210,150,${0.9 * p})`
  ctx.shadowBlur = radius * 0.5
  ctx.lineWidth = Math.max(1, radius * 0.035)
  ctx.strokeStyle = `rgba(255,236,210,${0.85 * p})`
  ctx.beginPath()
  ctx.arc(0, 0, radius * 0.96, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()

  // 4) Event horizon: a true black core with a crisp, slightly soft edge.
  ctx.save()
  ctx.translate(x, y)
  const core = ctx.createRadialGradient(0, 0, radius * 0.55, 0, 0, radius * 0.94)
  core.addColorStop(0, '#000000')
  core.addColorStop(0.85, '#000000')
  core.addColorStop(1, `rgba(0,0,0,${0.2 + 0.8 * (1 - p)})`)
  ctx.fillStyle = core
  ctx.beginPath()
  ctx.arc(0, 0, radius * 0.94, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawHandTarget(ctx: CanvasRenderingContext2D, hand: HandState, elapsed: number) {
  if (!hand.seen) return
  ctx.save()
  ctx.translate(hand.x, hand.y)
  const pull = hand.open ? hand.openness : 0
  ctx.strokeStyle = hand.fist ? 'rgba(255,232,167,0.52)' : `rgba(183,255,202,${0.12 + pull * 0.35})`
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.arc(0, 0, hand.fist ? 20 : 30 + Math.sin(elapsed * 7) * 3, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function PalmGravityStage({ video, paused }: { video: HTMLVideoElement; paused: boolean }) {
  const { canvasRef, ctxRef, sizeRef } = useCanvas2D()
  const { audioRef, muted, toggleMuted } = useGlassAudio(paused, 0.8)
  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const lastDetectRef = useRef(0)
  const handRef = useRef<HandState>({ seen: false, openness: 0, open: false, fist: false, x: 0, y: 0 })
  const pullRef = useRef(0)
  const wasFistRef = useRef(false)
  const wasEngagedRef = useRef(false)
  const particlesRef = useRef<Particle[]>([])
  const layoutKeyRef = useRef('')
  const quotesRef = useRef<string[][]>(randomQuotePair())
  const nextQuote = () => {
    const current = quotesRef.current[1]
    let next = QUOTES[Math.floor(Math.random() * QUOTES.length)]
    if (next === current) next = QUOTES[(QUOTES.indexOf(next) + 1) % QUOTES.length]
    quotesRef.current = [current, next]
  }

  useEffect(() => {
    let alive = true
    void createHandLandmarker(1).then((landmarker) => {
      if (alive) landmarkerRef.current = landmarker
      else landmarker.close()
    })
    return () => {
      alive = false
      landmarkerRef.current?.close()
      landmarkerRef.current = null
    }
  }, [])

  useAnimationLoop((elapsed, delta) => {
    const ctx = ctxRef.current
    const { width, height } = sizeRef.current
    if (!ctx || !width || !height) return

    drawBackground(ctx, video, width, height, elapsed)

    const quotes = quotesRef.current
    const layoutA = layoutQuote(ctx, quotes[0], width, height)
    const layoutB = layoutQuote(ctx, quotes[1], width, height)
    const layoutKey = `${width}:${height}:${layoutA.points.length}:${layoutB.points.length}`
    if (layoutKeyRef.current !== layoutKey) {
      layoutKeyRef.current = layoutKey
      particlesRef.current = []
    }
    ensureParticles(particlesRef.current, layoutA.points, layoutB.points, width, height)

    const now = performance.now()
    const landmarker = landmarkerRef.current
    if (landmarker && video.readyState >= 2 && now - lastDetectRef.current > 48) {
      lastDetectRef.current = now
      handRef.current = readHandState(landmarker.detectForVideo(video, now).landmarks[0], width, height)
    }

    const hand = handRef.current
    const fistStarted = hand.fist && !wasFistRef.current
    wasFistRef.current = hand.fist
    if (fistStarted) {
      swapPoems(particlesRef.current)
      nextQuote()
      layoutKeyRef.current = ''
      // closing the fist recomposes the quote — a low consonant glass chord
      audioRef.current?.chord(GLASS_SCALE[0], { bright: 0.5, dur: 3.2, gain: 0.4 })
    }

    const targetPull = hand.seen && hand.open ? hand.openness : 0
    pullRef.current = lerp(pullRef.current, targetPull, 1 - Math.exp(-delta * 4.2))
    const pull = pullRef.current

    // the moment the open palm crosses into the event horizon: a bright bell swell
    const engaged = pull > 0.2
    if (engaged && !wasEngagedRef.current) {
      const pan = hand.seen ? Math.max(-1, Math.min(1, (hand.x / sizeRef.current.width) * 2 - 1)) : 0
      audioRef.current?.bell(GLASS_SCALE[4], { bright: 0.95, dur: 2.6, gain: 0.34, pan })
    }
    wasEngagedRef.current = engaged
    const centerX = hand.seen ? hand.x : width * 0.5
    const centerY = hand.seen ? hand.y : height * 0.48
    const radius = clamp(Math.min(width, height) * (0.07 + pull * 0.045), 32, 74)

    drawBlackHole(ctx, centerX, centerY, radius, pull, elapsed)

    ctx.font = quoteFont(layoutA.fontSize)
    ctx.textBaseline = 'top'

    for (const particle of particlesRef.current) {
      particle.px = particle.x
      particle.py = particle.y

      const dist0 = Math.hypot(centerX - particle.x, centerY - particle.y)

      if (pull > 0.03) {
        const dx = centerX - particle.x
        const dy = centerY - particle.y
        const dist = Math.max(radius * 0.55, dist0)
        const nx = dx / dist
        const ny = dy / dist
        // Tangential direction (consistent CCW orbit) for a clean accretion spiral.
        const tangentX = -ny
        const tangentY = nx

        // Radial pull ~ 1/r (clamped) so suction accelerates hard up close.
        const gravity = clamp((radius * radius * 0.09) / (dist * dist) + radius * 0.012 / dist, 0.0, 0.6) * 60 * pull
        // Orbital speed for a stable-ish spiral: faster nearer the core.
        const orbital = clamp((radius * 1.6) / dist, 0.18, 2.4) * (8 + pull * 10)

        particle.vx += nx * gravity * delta * 60 + tangentX * orbital * delta
        particle.vy += ny * gravity * delta * 60 + tangentY * orbital * delta
        particle.swallowed = clamp(particle.swallowed + delta * pull * 1.6, 0, 1)

        // Near the horizon: spiral tightly along the disk and lose energy (spaghettified).
        if (dist0 < radius * 1.05) {
          particle.angle += delta * (3 + pull * 6)
          const rr = Math.max(radius * 0.6, dist0 * 0.92)
          const tx = centerX + Math.cos(particle.angle) * rr
          const ty = centerY + Math.sin(particle.angle) * rr * 0.4
          particle.vx += (tx - particle.x) * 0.5
          particle.vy += (ty - particle.y) * 0.5
          particle.vx *= 0.86
          particle.vy *= 0.86
        }
      } else {
        const tx = hand.fist ? particle.nextX : particle.homeX
        const ty = hand.fist ? particle.nextY : particle.homeY
        // Spring-back to text; stiffer when recomposing on a fist.
        const settle = 1 - Math.exp(-delta * (hand.fist ? 6.5 : 4.4))
        particle.vx += (tx - particle.x) * settle * 0.32
        particle.vy += (ty - particle.y) * settle * 0.32
        particle.swallowed = clamp(particle.swallowed - delta * 1.1, 0, 1)
      }

      const drag = pull > 0.03 ? 0.985 : 0.8
      particle.vx *= drag
      particle.vy *= drag
      // Clamp velocity so nothing goes chaotic.
      const vmag = Math.hypot(particle.vx, particle.vy)
      const vmax = 90
      if (vmag > vmax) {
        particle.vx = (particle.vx / vmag) * vmax
        particle.vy = (particle.vy / vmag) * vmax
      }
      particle.x += particle.vx * delta * 36
      particle.y += particle.vy * delta * 36

      const speed = Math.hypot(particle.x - particle.px, particle.y - particle.py)
      const alpha = clamp(0.22 + speed * 0.045 + (1 - particle.swallowed) * 0.54, 0.2, 0.96)
      const heat = clamp(particle.heat + pull * 0.9 + (particle.swallowed - 0.3) * 0.8, 0, 1)

      // Motion-blur trail toward the core: stretches into a streak as it accelerates inward.
      if (speed > 0.5) {
        const stretch = clamp(speed * 0.06, 0, 1.6)
        ctx.strokeStyle = `rgba(${Math.round(255)},${Math.round(190 + heat * 60)},${Math.round(120 + heat * 90)},${0.06 + pull * 0.2 + heat * 0.15})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(particle.px - particle.vx * stretch, particle.py - particle.vy * stretch)
        ctx.lineTo(particle.x, particle.y)
        ctx.stroke()
      }

      ctx.fillStyle =
        pull > 0.08
          ? `rgba(255,${Math.round(228 - heat * 60)},${Math.round(200 - heat * 150)},${alpha})`
          : hand.fist
            ? `rgba(255,235,184,${alpha})`
            : `rgba(238,238,226,${alpha})`
      ctx.fillText(particle.char, particle.x, particle.y)
    }

    drawHandTarget(ctx, hand, elapsed)

    ctx.fillStyle = 'rgba(255,255,255,0.58)'
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace'
    const label = !hand.seen
      ? 'searching for palm'
      : pull > 0.15
        ? 'open palm: event horizon'
        : hand.fist
        ? 'fist: next philosopher'
          : 'open palm to bend the quote'
    ctx.fillText(label, 18, height - 28)
  }, paused)

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full bg-black" />
      <SoundToggle muted={muted} onToggle={toggleMuted} />
    </div>
  )
}

export default function PalmGravityExperiment({ paused }: ExperimentProps) {
  return (
    <WebcamGate hint="allow camera access so your hand can bend philosopher quotes over the live image">
      {(video) => <PalmGravityStage video={video} paused={paused} />}
    </WebcamGate>
  )
}

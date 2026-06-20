import { useEffect, useRef, useState } from 'react'
import type { FaceLandmarker, HandLandmarker } from '@mediapipe/tasks-vision'
import type { ExperimentProps } from '@/shared/types'
import { useCanvas2D } from '@/shared/hooks/useCanvas2D'
import { useAnimationLoop } from '@/shared/hooks/useAnimationLoop'
import { WebcamGate } from '@/shared/components/WebcamGate'
import { SoundToggle } from '@/shared/components/SoundToggle'
import { createFaceLandmarker, createHandLandmarker } from '@/shared/lib/mediapipe'
import { TinyAudio } from '../_shared/asciiTools'

// MediaPipe hand landmark indices
const THUMB_TIP = 4
const INDEX_TIP = 8

const PINCH_ON = 46 // px — pinch threshold to grow / hold a dandelion
const SEED_COUNT = 130 // pappus tufts on a full head
const STEM_LEN = 150
const STEM_GRIP_PAD = 26
const BREATH_COOLDOWN_MS = 150
const TIP_GLYPHS = ['✺', '✲', '✳', '❉', '*']
const FEATHER = ['·', '˙', '`']
const AIR_GLYPHS = ['~', '‿', '⌒', '﹏', '≈']

const COL_STEM = '#8fcf76'
const COL_HEAD = '#3f4836'
const COL_AIR = '#bfe3ff'

// light direction (top-left, slightly toward camera) for shading the puff
const LX = -0.5
const LY = -0.62
const LZ = 0.6

interface Tuft {
  // unit direction on the sphere (dx,dy on screen; dz depth toward camera)
  dx: number
  dy: number
  dz: number
  tip: string
  attached: boolean
  // flying state (once detached)
  x: number
  y: number
  vx: number
  vy: number
  life: number
  size: number
  spin: number
}

interface Gust {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  glyph: string
}

interface Garden {
  hx: number
  hy: number
  gripX: number
  gripY: number
  hasHead: boolean
  headR: number
  tufts: Tuft[]
  gusts: Gust[]
  prevPinchX: number
  prevPinchY: number
  pinching: boolean
  growth: number
  lastBreathBlow: number
}

interface Breath {
  x: number
  y: number
  open: number
  active: boolean
}

function makeGarden(w: number, h: number): Garden {
  return {
    hx: w / 2,
    hy: h / 2,
    gripX: w / 2,
    gripY: h / 2 + STEM_LEN,
    hasHead: false,
    headR: 64,
    tufts: [],
    gusts: [],
    prevPinchX: 0,
    prevPinchY: 0,
    pinching: false,
    growth: 0,
    lastBreathBlow: 0,
  }
}

function placeByStemGrip(g: Garden, x: number, y: number, follow = 1) {
  g.gripX += (x - g.gripX) * follow
  g.gripY += (y - g.gripY) * follow
  g.hx += (x - g.hx) * follow
  g.hy += (y - STEM_LEN - g.hy) * follow
}

function spawnHead(g: Garden, gripX: number, gripY: number) {
  g.gripX = gripX
  g.gripY = gripY
  g.hx = gripX
  g.hy = gripY - STEM_LEN
  g.hasHead = true
  g.growth = 0
  g.tufts = []
  // Fibonacci sphere — even coverage gives a believable volumetric puff
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < SEED_COUNT; i++) {
    const dy = 1 - (i / (SEED_COUNT - 1)) * 2 // 1 .. -1
    const r = Math.sqrt(Math.max(0, 1 - dy * dy))
    const theta = i * golden
    g.tufts.push({
      dx: Math.cos(theta) * r,
      dy,
      dz: Math.sin(theta) * r,
      tip: TIP_GLYPHS[i % TIP_GLYPHS.length],
      attached: true,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 1,
      size: 12 + Math.random() * 4,
      spin: Math.random() * Math.PI * 2,
    })
  }
}

function Scene({ video, paused }: { video: HTMLVideoElement } & ExperimentProps) {
  const { canvasRef, ctxRef, sizeRef } = useCanvas2D()
  const videoRef = useRef<HTMLVideoElement>(null)
  const lmRef = useRef<HandLandmarker | null>(null)
  const faceRef = useRef<FaceLandmarker | null>(null)
  const lastDetect = useRef(0)
  const gardenRef = useRef<Garden | null>(null)
  const audioRef = useRef(new TinyAudio())
  const [muted, setMuted] = useState(false)
  const pinchRef = useRef<{ x: number; y: number; dist: number } | null>(null)
  const breathRef = useRef<Breath | null>(null)

  useEffect(() => {
    const el = videoRef.current
    if (el) {
      el.srcObject = video.srcObject
      void el.play().catch(() => {})
    }
  }, [video])

  useEffect(() => {
    let alive = true
    const audio = audioRef.current
    void Promise.all([createHandLandmarker(1), createFaceLandmarker()]).then(([handLm, faceLm]) => {
      if (alive) {
        lmRef.current = handLm
        faceRef.current = faceLm
      } else {
        handLm.close()
        faceLm.close()
      }
    })
    return () => {
      alive = false
      lmRef.current?.close()
      faceRef.current?.close()
      audio.dispose()
    }
  }, [])

  useEffect(() => {
    audioRef.current.setMuted(muted || paused)
  }, [muted, paused])

  useAnimationLoop((_elapsed, delta) => {
    const ctx = ctxRef.current
    if (!ctx) return
    const { width, height } = sizeRef.current
    if (!width || !height) return
    const now = performance.now()
    const audio = audioRef.current

    if (!gardenRef.current) gardenRef.current = makeGarden(width, height)
    const g = gardenRef.current

    // ── hand detection (~20fps) ─────────────────────────────
    const lm = lmRef.current
    const faceLm = faceRef.current
    if ((lm || faceLm) && video.readyState >= 2 && now - lastDetect.current > 50) {
      lastDetect.current = now
      const hand = lm?.detectForVideo(video, now).landmarks[0]
      if (hand) {
        const it = hand[INDEX_TIP]
        const tt = hand[THUMB_TIP]
        const ix = (1 - it.x) * width
        const iy = it.y * height
        const tx = (1 - tt.x) * width
        const ty = tt.y * height
        pinchRef.current = {
          x: (ix + tx) / 2,
          y: (iy + ty) / 2,
          dist: Math.hypot(ix - tx, iy - ty),
        }
      } else {
        pinchRef.current = null
      }

      const face = faceLm?.detectForVideo(video, now).faceLandmarks[0]
      if (face) {
        const upperLip = face[13]
        const lowerLip = face[14]
        const mouthL = face[61]
        const mouthR = face[291]
        const mouthW = Math.hypot((mouthR.x - mouthL.x) * width, (mouthR.y - mouthL.y) * height) || 1
        const mouthH = Math.hypot((lowerLip.x - upperLip.x) * width, (lowerLip.y - upperLip.y) * height)
        const open = Math.max(0, Math.min(1, (mouthH / mouthW - 0.22) / 0.38))
        breathRef.current = {
          x: (1 - (mouthL.x + mouthR.x) / 2) * width,
          y: ((mouthL.y + mouthR.y) / 2) * height,
          open,
          active: open > 0.2,
        }
      } else {
        breathRef.current = null
      }
    }

    const pinch = pinchRef.current
    const wasPinching = g.pinching
    const isPinching = !!pinch && pinch.dist < PINCH_ON

    let speed = 0
    if (pinch) {
      const dx = pinch.x - g.prevPinchX
      const dy = pinch.y - g.prevPinchY
      speed = Math.hypot(dx, dy) / Math.max(delta, 0.001)
      g.prevPinchX = pinch.x
      g.prevPinchY = pinch.y
    }

    if (isPinching && pinch) {
      if (!wasPinching || !g.hasHead) spawnHead(g, pinch.x, pinch.y + STEM_GRIP_PAD)
      placeByStemGrip(g, pinch.x, pinch.y + STEM_GRIP_PAD, Math.min(1, 12 * delta))
    }
    g.pinching = isPinching
    if (g.hasHead && g.growth < 1) g.growth = Math.min(1, g.growth + delta * 2.2)

    const breath = breathRef.current
    const released = wasPinching && !isPinching
    const flickBlow = speed > 950 || (released && speed > 420)
    const breathNearHead = !!breath && g.hasHead && Math.abs(breath.y - g.hy) < g.headR * 2.8 && Math.abs(breath.x - g.hx) < Math.max(260, width * 0.42)
    const breathBlow = !!breath && breathNearHead && breath.open > 0.18 && now - g.lastBreathBlow > BREATH_COOLDOWN_MS
    const blowing = g.hasHead && (breathBlow || flickBlow)

    let blowDir = 1
    let blowX = g.hx - g.headR - 40
    let blowY = g.hy
    let blowPower = 1
    if (breath && breathNearHead) {
      const dx = g.hx - breath.x
      blowDir = Math.abs(dx) > 8 ? Math.sign(dx) : 1
      blowX = breath.x
      blowY = breath.y
      blowPower = 0.7 + breath.open * 1.6
    } else if (pinch) {
      const dx = pinch.x - g.hx
      if (Math.abs(dx) > 2) blowDir = Math.sign(dx)
      blowPower = Math.min(1.6, Math.max(0.8, speed / 900))
    }

    if (blowing) {
      if (breathBlow) g.lastBreathBlow = now
      const attached = g.tufts.filter((t) => t.attached)
      const toRelease = Math.min(attached.length, Math.round(5 + blowPower * 9 + Math.random() * 5))
      let releasedAny = false
      for (let k = 0; k < toRelease; k++) {
        const t = attached[Math.floor(Math.random() * attached.length)]
        if (!t.attached) continue
        t.attached = false
        releasedAny = true
        t.x = g.hx + t.dx * g.headR
        t.y = g.hy + t.dy * g.headR
        t.vx = blowDir * (190 + Math.random() * 280) * blowPower
        t.vy = (-70 + Math.random() * 90) * blowPower
        t.life = 1
      }
      if (releasedAny) {
        audio.tone(620 + Math.random() * 380, 0.03, 0.22, 'sine', (g.hx / width) * 2 - 1)
      }
      const gustCount = 2 + Math.floor(blowPower * 4)
      for (let i = 0; i < gustCount; i++) {
        g.gusts.push({
          x: blowX + Math.random() * 18 - 9,
          y: blowY + (Math.random() - 0.5) * 34,
          vx: blowDir * (220 + Math.random() * 220) * blowPower,
          vy: (g.hy - blowY) * 0.9 + (Math.random() - 0.5) * 70,
          life: 1,
          glyph: AIR_GLYPHS[Math.floor(Math.random() * AIR_GLYPHS.length)],
        })
      }
      audio.noise(0.018, 0.09, (g.hx / width) * 2 - 1)
    }

    // ── update flying tufts ─────────────────────────────────
    for (const t of g.tufts) {
      if (t.attached) continue
      t.vx *= 0.985
      t.vy += 26 * delta
      t.vy += Math.sin(now * 0.003 + t.spin) * 12 * delta
      t.x += t.vx * delta
      t.y += t.vy * delta
      t.spin += delta * 2
      t.life -= delta * 0.45
    }
    g.tufts = g.tufts.filter((t) => t.attached || t.life > 0)

    for (const gu of g.gusts) {
      gu.x += gu.vx * delta
      gu.y += gu.vy * delta
      gu.life -= delta * 1.2
    }
    g.gusts = g.gusts.filter((gu) => gu.life > 0)

    // ════════ DRAW (transparent — webcam shows through, no darkening) ═══════
    ctx.clearRect(0, 0, width, height)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    if (g.hasHead) {
      const grow = g.growth
      const headR = g.headR * grow
      const gripX = g.gripX
      const gripY = g.gripY
      // slow idle rotation for life
      const rot = now * 0.00035
      const cos = Math.cos(rot)
      const sin = Math.sin(rot)

      // stem: the pinch holds this lower part, the puff sits above the fingers
      ctx.strokeStyle = COL_STEM
      ctx.lineWidth = 3
      ctx.beginPath()
      const bend = Math.sin(now * 0.0012) * 10
      ctx.moveTo(gripX, gripY)
      ctx.bezierCurveTo(gripX + bend, gripY - STEM_LEN * 0.35, g.hx - 18, g.hy + headR + 42, g.hx, g.hy + headR)
      ctx.stroke()

      ctx.fillStyle = isPinching ? 'rgba(180,240,140,0.9)' : 'rgba(143,207,118,0.45)'
      ctx.font = '13px ui-monospace, monospace'
      ctx.fillText('╎', gripX, gripY)

      // receptacle / head core
      ctx.font = `${Math.round(12 * grow)}px ui-monospace, monospace`
      ctx.fillStyle = COL_HEAD
      ctx.fillText('◍', g.hx, g.hy + headR + 2)

      // attached pappus tufts — depth-sorted for a volumetric puff
      const attached = g.tufts.filter((t) => t.attached)
      const view = attached
        .map((t) => {
          // rotate around vertical axis so the puff slowly turns
          const rx = t.dx * cos - t.dz * sin
          const rz = t.dx * sin + t.dz * cos
          return { t, rx, ry: t.dy, rz }
        })
        .sort((a, b) => a.rz - b.rz) // back to front

      for (const { t, rx, ry, rz } of view) {
        const sx = g.hx + rx * headR
        const sy = g.hy + ry * headR
        // depth 0..1 (front = 1)
        const depth = (rz + 1) / 2
        // lambert-ish shading from the light direction
        const lambert = Math.max(0.15, rx * LX + ry * LY + rz * LZ)
        const lum = 200 + lambert * 55 // 200..255 warm white
        const fr = Math.round(lum)
        const fg = Math.round(lum)
        const fb = Math.round(lum - 16)
        const alpha = (0.4 + depth * 0.6) * grow
        const size = t.size * grow * (0.7 + depth * 0.55)

        // filament: faint stalk from core to the tuft tip
        ctx.strokeStyle = `rgba(150,170,140,${0.1 + depth * 0.22})`
        ctx.lineWidth = 0.8
        ctx.beginPath()
        ctx.moveTo(g.hx, g.hy)
        ctx.lineTo(sx, sy)
        ctx.stroke()

        // fluffy feathers around the tip
        ctx.globalAlpha = alpha * 0.55
        ctx.fillStyle = `rgb(${fr},${fg},${fb})`
        ctx.font = `${Math.round(size * 0.55)}px ui-monospace, monospace`
        for (let f = 0; f < 3; f++) {
          const a = t.spin + (f / 3) * Math.PI * 2
          ctx.fillText(FEATHER[f % FEATHER.length], sx + Math.cos(a) * size * 0.32, sy + Math.sin(a) * size * 0.32)
        }

        // the star tip
        ctx.globalAlpha = alpha
        ctx.font = `${Math.round(size)}px ui-monospace, monospace`
        ctx.fillText(t.tip, sx, sy)
      }
      ctx.globalAlpha = 1

      // bare stubs where seeds have left
      for (const t of g.tufts) {
        if (t.attached) continue
        const sx = g.hx + t.dx * headR
        const sy = g.hy + t.dy * headR
        ctx.font = '8px ui-monospace, monospace'
        ctx.fillStyle = 'rgba(63,72,54,0.6)'
        ctx.fillText('.', sx, sy)
      }

      // flying tufts drifting away in the wind
      for (const t of g.tufts) {
        if (t.attached) continue
        ctx.globalAlpha = Math.max(0, Math.min(1, t.life))
        ctx.font = `${Math.round(t.size)}px ui-monospace, monospace`
        ctx.fillStyle = '#f5f3ea'
        for (let f = 0; f < 3; f++) {
          const a = t.spin + (f / 3) * Math.PI * 2
          ctx.fillText(FEATHER[f], t.x + Math.cos(a) * 4, t.y + Math.sin(a) * 4)
        }
        ctx.fillText(t.tip, t.x, t.y)
      }
      ctx.globalAlpha = 1
    }

    for (const gu of g.gusts) {
      ctx.globalAlpha = Math.max(0, Math.min(1, gu.life))
      ctx.font = `${18 + (1 - gu.life) * 10}px ui-monospace, monospace`
      ctx.fillStyle = COL_AIR
      ctx.fillText(gu.glyph, gu.x, gu.y)
    }
    ctx.globalAlpha = 1

    if (breath?.active) {
      ctx.globalAlpha = 0.25 + breath.open * 0.45
      ctx.strokeStyle = COL_AIR
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(breath.x, breath.y, 10 + breath.open * 14, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    if (pinch) {
      ctx.strokeStyle = isPinching ? 'rgba(180,240,140,0.9)' : 'rgba(120,210,255,0.5)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(pinch.x, pinch.y, isPinching ? 8 : 14, 0, Math.PI * 2)
      ctx.stroke()
    }
  }, paused)

  return (
    <div className="relative size-full overflow-hidden bg-black">
      <video
        ref={videoRef}
        playsInline
        muted
        className="absolute inset-0 size-full -scale-x-100 object-cover"
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 size-full"
        onPointerDown={() => audioRef.current.resume()}
      />
      <div className="absolute right-3 top-3">
        <SoundToggle muted={muted} onToggle={() => setMuted((v) => !v)} />
      </div>
    </div>
  )
}

export default function BreathGarden({ paused }: ExperimentProps) {
  return (
    <WebcamGate hint="pinch index + thumb to hold the stem, then blow toward the dandelion">
      {(video) => <Scene video={video} paused={paused} />}
    </WebcamGate>
  )
}

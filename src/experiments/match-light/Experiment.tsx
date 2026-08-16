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

const PINCH_ON = 40
const PINCH_OFF = 58
const DETECT_MS = 33
const BLOW_R = 220 // how near the mouth must be to affect the flame
const MAX_EMBERS = 70

interface Ember {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  hue: number
}

interface Match {
  pinch: boolean
  lit: boolean
  x: number
  y: number
  intensity: number // 0..1 smoothed light strength
  flicker: number
  lean: number // horizontal flame lean from breath
  lastStrike: number
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
  const handRef = useRef<HandLandmarker | null>(null)
  const faceRef = useRef<FaceLandmarker | null>(null)
  const lastDetect = useRef(0)

  const matchesRef = useRef<Match[]>([
    { pinch: false, lit: false, x: 0, y: 0, intensity: 0, flicker: 0, lean: 0, lastStrike: 0 },
    { pinch: false, lit: false, x: 0, y: 0, intensity: 0, flicker: 1.7, lean: 0, lastStrike: 0 },
  ])
  const tipsRef = useRef<{ mid: Point; gap: number }[]>([])
  const breathRef = useRef<{ x: number; y: number; open: number } | null>(null)
  const embersRef = useRef<Ember[]>([])
  const lightCanvas = useRef<HTMLCanvasElement | null>(null)
  const lastCrackle = useRef(0)

  const { audioRef, muted, toggleMuted } = useGlassAudio(paused, 0.3)

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

  useAnimationLoop((elapsed, delta) => {
    const ctx = ctxRef.current
    if (!ctx) return
    const { width, height } = sizeRef.current
    if (!width || !height) return
    const now = performance.now()
    const audio = audioRef.current

    // ── detection ───────────────────────────────────────────────
    if (video.readyState >= 2 && video.videoWidth > 0 && now - lastDetect.current > DETECT_MS) {
      const ts = now > lastDetect.current ? now : lastDetect.current + 1
      lastDetect.current = ts
      const hand = handRef.current
      if (hand) {
        const res = hand.detectForVideo(video, ts)
        const raw = res.landmarks.map((l) => {
          const thumb = mirroredPoint(l[4], width, height)
          const index = mirroredPoint(l[8], width, height)
          return { mid: { x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 }, gap: dist(thumb, index), palmX: (1 - l[0].x) * width }
        })
        raw.sort((a, b) => a.palmX - b.palmX)
        tipsRef.current = raw.map(({ mid, gap }) => ({ mid, gap }))
      }
      const face = faceRef.current
      if (face) {
        const lm = face.detectForVideo(video, ts).faceLandmarks[0]
        if (lm) {
          const up = lm[13]
          const low = lm[14]
          const l = lm[61]
          const r = lm[291]
          const mouthW = Math.hypot((r.x - l.x) * width, (r.y - l.y) * height) || 1
          const mouthH = Math.hypot((low.x - up.x) * width, (low.y - up.y) * height)
          breathRef.current = {
            x: (1 - (l.x + r.x) / 2) * width,
            y: ((up.y + low.y) / 2) * height,
            open: clamp((mouthH / mouthW - 0.2) / 0.4, 0, 1),
          }
        } else {
          breathRef.current = null
        }
      }
    }

    const tips = tipsRef.current
    const breath = breathRef.current

    // ── update matches ──────────────────────────────────────────
    let anyLit = false
    for (let h = 0; h < 2; h++) {
      const m = matchesRef.current[h]
      const hand = tips[h]
      const wasPinch = m.pinch
      const isPinch = hand ? (wasPinch ? hand.gap < PINCH_OFF : hand.gap < PINCH_ON) : false
      m.pinch = isPinch

      if (hand) {
        m.x = lerp(m.x || hand.mid.x, hand.mid.x, 0.5)
        m.y = lerp(m.y || hand.mid.y, hand.mid.y, 0.5)
      }
      // strike: pinch just started → light it
      if (isPinch && !wasPinch) {
        m.lit = true
        m.lastStrike = now
        audio?.bell(GLASS_SCALE[4], { bright: 0.8, dur: 0.5, gain: 0.28, pan: (m.x / width) * 2 - 1 })
        for (let i = 0; i < 8; i++) spawnEmber(embersRef.current, m.x, m.y, 2.4)
      }
      if (!isPinch) m.lit = false // put the match away when released

      // breath leans / snuffs the flame
      let blow = 0
      if (m.lit && breath && breath.open > 0.15) {
        const d = dist(breath, { x: m.x, y: m.y })
        if (d < BLOW_R) {
          blow = breath.open * (1 - d / BLOW_R)
          m.lean = lerp(m.lean, Math.sign(m.x - breath.x) * blow * 26, 0.4)
          if (blow > 0.42 && now - m.lastStrike > 350) {
            m.lit = false
            audio?.bell(GLASS_SCALE[0], { bright: 0.2, dur: 0.6, gain: 0.2, pan: (m.x / width) * 2 - 1 })
            for (let i = 0; i < 12; i++) spawnEmber(embersRef.current, m.x, m.y, 1.4)
          }
        }
      }
      m.lean = lerp(m.lean, blow === 0 ? 0 : m.lean, 0.2)
      m.flicker += delta * (8 + Math.random() * 6)
      const targetIntensity = m.lit ? clamp(0.85 - blow * 0.5 + Math.sin(m.flicker) * 0.08, 0.25, 1) : 0
      m.intensity = lerp(m.intensity, targetIntensity, m.lit ? 0.4 : 0.25)
      if (m.lit) {
        anyLit = true
        // rising embers + crackle
        if (Math.random() < 0.25 && embersRef.current.length < MAX_EMBERS) spawnEmber(embersRef.current, m.x, m.y, 1)
      }
    }

    // ambient crackle while any flame burns
    if (anyLit && now - lastCrackle.current > 90 && Math.random() < 0.5) {
      lastCrackle.current = now
      audio?.sparkle((matchesRef.current.find((m) => m.lit)?.x ?? width / 2) / width * 2 - 1)
    }
    audio?.setPadBrightness(anyLit ? 0.4 : 0.05)

    // update embers
    const embers = embersRef.current
    for (const e of embers) {
      e.vy -= 40 * delta
      e.vx *= 0.97
      e.x += e.vx * delta
      e.y += e.vy * delta
      e.life -= delta * 0.9
    }
    embersRef.current = embers.filter((e) => e.life > 0)

    // ════════ RENDER ════════════════════════════════════════════
    // 1. webcam (mirrored) as the hidden scene
    ctx.save()
    ctx.translate(width, 0)
    ctx.scale(-1, 1)
    if (video.readyState >= 2 && video.videoWidth > 0) ctx.drawImage(video, 0, 0, width, height)
    else {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, width, height)
    }
    ctx.restore()

    // 2. build the warm light map (black everywhere, warm pools at flames)
    let lc = lightCanvas.current
    if (!lc) lc = lightCanvas.current = document.createElement('canvas')
    if (lc.width !== Math.round(width) || lc.height !== Math.round(height)) {
      lc.width = Math.round(width)
      lc.height = Math.round(height)
    }
    const lctx = lc.getContext('2d')!
    lctx.setTransform(1, 0, 0, 1, 0, 0)
    lctx.globalCompositeOperation = 'source-over'
    lctx.fillStyle = '#05040a' // never fully black — a faint ambient floor
    lctx.fillRect(0, 0, lc.width, lc.height)
    lctx.globalCompositeOperation = 'lighter'
    for (const m of matchesRef.current) {
      if (m.intensity <= 0.01) continue
      const R = 150 + m.intensity * 190 + Math.sin(m.flicker * 1.3) * 12
      const g = lctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, R)
      g.addColorStop(0, `rgba(255,240,214,${0.95 * m.intensity})`)
      g.addColorStop(0.35, `rgba(255,190,120,${0.7 * m.intensity})`)
      g.addColorStop(1, 'rgba(20,10,4,0)')
      lctx.fillStyle = g
      lctx.beginPath()
      lctx.arc(m.x, m.y, R, 0, Math.PI * 2)
      lctx.fill()
    }
    // multiply the light map onto the webcam → only lit areas survive
    ctx.save()
    ctx.globalCompositeOperation = 'multiply'
    ctx.drawImage(lc, 0, 0, width, height)
    ctx.restore()

    // 3. flames + embers glow additively
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (const m of matchesRef.current) {
      if (m.intensity <= 0.02) continue
      drawFlame(ctx, m, elapsed)
    }
    for (const e of embers) {
      const a = clamp(e.life, 0, 1)
      ctx.fillStyle = `hsla(${e.hue}, 95%, ${55 + a * 25}%, ${a})`
      ctx.beginPath()
      ctx.arc(e.x, e.y, 1.4 + a * 1.6, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()

    // HUD
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(255,220,180,0.55)'
    ctx.fillText(anyLit ? 'breathe on the flame to gutter it — blow to snuff it out' : 'pinch thumb + index to strike a match', 16, height - 16)
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

function spawnEmber(embers: Ember[], x: number, y: number, power: number) {
  if (embers.length >= MAX_EMBERS) return
  embers.push({
    x: x + (Math.random() - 0.5) * 6,
    y: y - 8,
    vx: (Math.random() - 0.5) * 40 * power,
    vy: -(30 + Math.random() * 50) * power,
    life: 0.5 + Math.random() * 0.7,
    hue: 20 + Math.random() * 30,
  })
}

/** Procedural teardrop flame with flicker + breath lean. */
function drawFlame(ctx: CanvasRenderingContext2D, m: Match, t: number) {
  const s = m.intensity
  const flick = Math.sin(m.flicker) * 0.12 + Math.sin(m.flicker * 2.3) * 0.06
  const h = (46 + s * 26) * (1 + flick)
  const w = (14 + s * 8) * (1 - flick * 0.5)
  const tipX = m.x + m.lean
  const baseY = m.y + 6

  // outer warm glow
  const glow = ctx.createRadialGradient(m.x, m.y - h * 0.3, 0, m.x, m.y - h * 0.3, h * 1.6)
  glow.addColorStop(0, `rgba(255,180,90,${0.5 * s})`)
  glow.addColorStop(1, 'rgba(255,120,40,0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(m.x, m.y - h * 0.3, h * 1.6, 0, Math.PI * 2)
  ctx.fill()

  // flame body (teardrop bezier)
  ctx.beginPath()
  ctx.moveTo(m.x - w, baseY)
  ctx.quadraticCurveTo(m.x - w * 0.7, m.y - h * 0.5, tipX, m.y - h)
  ctx.quadraticCurveTo(m.x + w * 0.7, m.y - h * 0.5, m.x + w, baseY)
  ctx.quadraticCurveTo(m.x, baseY + 6, m.x - w, baseY)
  const body = ctx.createLinearGradient(0, m.y - h, 0, baseY)
  body.addColorStop(0, `rgba(255,244,190,${0.95 * s})`)
  body.addColorStop(0.5, `rgba(255,170,60,${0.9 * s})`)
  body.addColorStop(1, `rgba(210,60,20,${0.5 * s})`)
  ctx.fillStyle = body
  ctx.fill()

  // blue-hot inner core
  ctx.beginPath()
  ctx.moveTo(m.x - w * 0.4, baseY - 2)
  ctx.quadraticCurveTo(m.x, m.y - h * 0.6, (tipX + m.x) / 2, m.y - h * 0.55)
  ctx.quadraticCurveTo(m.x + w * 0.4, m.y - h * 0.3, m.x + w * 0.4, baseY - 2)
  ctx.closePath()
  ctx.fillStyle = `rgba(255,255,235,${0.9 * s})`
  ctx.fill()

  // faint wick
  ctx.strokeStyle = `rgba(40,30,26,${0.6 * s})`
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(m.x, baseY)
  ctx.lineTo(m.x - Math.sin(t) * 2, baseY + 10)
  ctx.stroke()
}

export default function MatchLight({ paused }: ExperimentProps) {
  return (
    <WebcamGate hint="the room goes dark — pinch thumb and index to strike a match and light what's around you">
      {(video) => <Scene video={video} paused={paused} />}
    </WebcamGate>
  )
}

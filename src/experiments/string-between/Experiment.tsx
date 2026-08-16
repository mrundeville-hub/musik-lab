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

const SEGS = 18
const DETECT_MS = 33
const PLUCK_R = 42
const KNOT_R = 36

interface Node {
  x: number
  y: number
  ox: number
  oy: number
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
  const tipsRef = useRef<Point[]>([])
  const prevTipsRef = useRef<(Point | null)[]>([null, null])
  const nodesRef = useRef<Node[]>([])
  const energyRef = useRef(0)
  const lastPluck = useRef(0)
  const lastKnot = useRef(0)
  const { audioRef, muted, toggleMuted } = useGlassAudio(paused, 0.4)

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

  useAnimationLoop((_elapsed, delta) => {
    const ctx = ctxRef.current
    if (!ctx) return
    const { width, height } = sizeRef.current
    if (!width || !height) return
    const now = performance.now()
    const audio = audioRef.current

    if (video.readyState >= 2 && video.videoWidth > 0 && now - lastDetect.current > DETECT_MS) {
      const ts = now > lastDetect.current ? now : lastDetect.current + 1
      lastDetect.current = ts
      const lm = handRef.current
      if (lm) {
        const res = lm.detectForVideo(video, ts)
        const raw = res.landmarks.map((l) => ({
          tip: mirroredPoint(l[8], width, height),
          palmX: (1 - l[0].x) * width,
        }))
        raw.sort((a, b) => a.palmX - b.palmX)
        tipsRef.current = raw.map((r) => r.tip)
      }
    }

    const tips = tipsRef.current
    drawDimWebcam(ctx, video, width, height, 0.45)
    ctx.fillStyle = 'rgba(6, 8, 14, 0.5)'
    ctx.fillRect(0, 0, width, height)

    if (tips.length < 2) {
      nodesRef.current = []
      prevTipsRef.current = [null, null]
      ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx.fillStyle = 'rgba(210,230,255,0.55)'
      ctx.fillText('show both index fingers to stretch a glass string between them', 16, height - 16)
      return
    }

    const a = tips[0]
    const b = tips[1]
    const gap = dist(a, b)
    const angle = Math.atan2(b.y - a.y, b.x - a.x)

    // (re)seed nodes along the chord
    let nodes = nodesRef.current
    if (nodes.length !== SEGS + 1) {
      nodes = Array.from({ length: SEGS + 1 }, () => ({ x: a.x, y: a.y, ox: a.x, oy: a.y }))
      nodesRef.current = nodes
    }
    // pin endpoints, spring interior toward chord + leftover pluck energy
    for (let i = 0; i <= SEGS; i++) {
      const t = i / SEGS
      const tx = lerp(a.x, b.x, t)
      const ty = lerp(a.y, b.y, t)
      const n = nodes[i]
      if (i === 0 || i === SEGS) {
        n.x = tx
        n.y = ty
        n.ox = tx
        n.oy = ty
      } else {
        // verlet: continue velocity, pull toward rest
        const vx = (n.x - n.ox) * 0.92
        const vy = (n.y - n.oy) * 0.92
        n.ox = n.x
        n.oy = n.y
        n.x += vx + (tx - n.x) * 0.28
        n.y += vy + (ty - n.y) * 0.28
      }
    }

    // pluck: a fingertip crossed the string with speed
    energyRef.current = Math.max(0, energyRef.current - delta * 1.4)
    for (let i = 0; i < tips.length; i++) {
      const tip = tips[i]
      const prev = prevTipsRef.current[i]
      prevTipsRef.current[i] = { x: tip.x, y: tip.y }
      if (!prev || now - lastPluck.current < 180) continue
      // distance tip→line segment
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len2 = dx * dx + dy * dy || 1
      const t = clamp(((tip.x - a.x) * dx + (tip.y - a.y) * dy) / len2, 0.08, 0.92)
      const px = a.x + dx * t
      const py = a.y + dy * t
      const d = Math.hypot(tip.x - px, tip.y - py)
      const speed = dist(prev, tip)
      if (d < PLUCK_R && speed > 18) {
        lastPluck.current = now
        const impulse = clamp(speed / 40, 0.4, 2.2)
        energyRef.current = Math.min(1.5, energyRef.current + impulse)
        // shove nearby nodes perpendicular to the string
        const nx = -Math.sin(angle)
        const ny = Math.cos(angle)
        const sign = Math.sign((tip.x - a.x) * dy - (tip.y - a.y) * dx) || 1
        const mid = Math.round(t * SEGS)
        for (let k = 1; k < SEGS; k++) {
          const falloff = Math.exp(-Math.abs(k - mid) * 0.55)
          nodes[k].x += nx * sign * impulse * 28 * falloff
          nodes[k].y += ny * sign * impulse * 28 * falloff
        }
        const note = clamp(Math.floor((1 - gap / Math.max(width, 1)) * GLASS_SCALE.length), 0, GLASS_SCALE.length - 1)
        audio?.bell(GLASS_SCALE[note] * (1 + Math.sin(angle) * 0.03), {
          bright: 0.55 + energyRef.current * 0.3,
          dur: 1.8,
          gain: 0.18 + impulse * 0.12,
          pan: clamp(((a.x + b.x) / 2 / width) * 2 - 1, -1, 1),
        })
      }
    }
    for (let i = tips.length; i < 2; i++) prevTipsRef.current[i] = null

    // knot: fingertips meet → chord + dissolve sparkles
    if (gap < KNOT_R && now - lastKnot.current > 900) {
      lastKnot.current = now
      audio?.chord(GLASS_SCALE[2], { bright: 0.7, dur: 2.6, gain: 0.36 })
      energyRef.current = 1.2
    }

    audio?.setPadBrightness(clamp(0.15 + energyRef.current * 0.5 + (1 - gap / Math.max(width, 1)) * 0.2, 0, 1))

    // draw string
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.shadowColor = 'rgba(180, 230, 255, 0.85)'
    ctx.shadowBlur = 10 + energyRef.current * 14
    ctx.strokeStyle = `rgba(210, 245, 255, ${0.55 + energyRef.current * 0.35})`
    ctx.lineWidth = 1.6 + energyRef.current * 1.2
    ctx.beginPath()
    for (let i = 0; i <= SEGS; i++) {
      const n = nodes[i]
      if (i === 0) ctx.moveTo(n.x, n.y)
      else ctx.lineTo(n.x, n.y)
    }
    ctx.stroke()
    // bright core
    ctx.shadowBlur = 0
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.35 + energyRef.current * 0.4})`
    ctx.lineWidth = 0.8
    ctx.stroke()
    ctx.restore()

    // fingertip anchors
    for (const p of tips) {
      ctx.fillStyle = '#e8fbff'
      ctx.shadowColor = 'rgba(170,230,255,0.9)'
      ctx.shadowBlur = 12
      ctx.beginPath()
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
    }

    // HUD
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.fillStyle = 'rgba(210,230,255,0.55)'
    ctx.fillText('flick across the string to pluck · stretch for pitch · tip for vibrato', 16, height - 16)
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

export default function StringBetween({ paused }: ExperimentProps) {
  return (
    <WebcamGate hint="hold up both index fingers — a glass string will stretch between them">
      {(video) => <Scene video={video} paused={paused} />}
    </WebcamGate>
  )
}

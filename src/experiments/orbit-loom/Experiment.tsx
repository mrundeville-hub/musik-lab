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

const DETECT_MS = 33
const TIP_IDX = [8, 12, 16, 20] // index, middle, ring, pinky
const K = 38 // spring stiffness
const DAMP = 0.86
const ORBIT_R = 18

interface Node {
  x: number
  y: number
  vx: number
  vy: number
  tx: number
  ty: number
  hand: number
  i: number
}

interface Spring {
  a: number
  b: number
  rest: number
  bridge?: boolean
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}

function Scene({ video, paused }: { video: HTMLVideoElement } & ExperimentProps) {
  const { canvasRef, ctxRef, sizeRef } = useCanvas2D()
  const handRef = useRef<HandLandmarker | null>(null)
  const lastDetect = useRef(0)
  const nodesRef = useRef<Node[]>([])
  const springsRef = useRef<Spring[]>([])
  const fistRef = useRef([0, 0])
  const lastPluck = useRef(0)
  const phase = useRef(0)

  const { audioRef, muted, toggleMuted } = useGlassAudio(paused, 0.32)

  useEffect(() => {
    let alive = true
    void createHandLandmarker(2).then((h) => {
      if (alive) handRef.current = h
      else h.close()
    })
    return () => {
      alive = false
      handRef.current?.close()
      handRef.current = null
    }
  }, [])

  useAnimationLoop((elapsed, delta) => {
    const ctx = ctxRef.current
    if (!ctx) return
    const { width, height } = sizeRef.current
    if (!width || !height) return
    const now = performance.now()
    const audio = audioRef.current
    const dt = Math.min(delta, 0.05)
    phase.current = elapsed

    if (video.readyState >= 2 && video.videoWidth > 0 && now - lastDetect.current > DETECT_MS) {
      const ts = now > lastDetect.current ? now : lastDetect.current + 1
      lastDetect.current = ts
      const hand = handRef.current
      const tips: { p: Point; hand: number; i: number }[] = []
      const fists = [0, 0]
      if (hand) {
        const res = hand.detectForVideo(video, ts)
        res.landmarks.forEach((lm, hi) => {
          const wrist = mirroredPoint(lm[0], width, height)
          const tipsRaw = TIP_IDX.map((idx, i) => ({ p: mirroredPoint(lm[idx], width, height), hand: hi, i }))
          const avgDist =
            tipsRaw.reduce((s, t) => s + dist(t.p, wrist), 0) / Math.max(1, tipsRaw.length)
          // closed fist → tips near wrist
          fists[hi] = clamp(1 - (avgDist - 40) / 90, 0, 1)
          tips.push(...tipsRaw)
        })
      }
      fistRef.current = fists

      // rebuild nodes matching tip count
      const nodes = nodesRef.current
      while (nodes.length < tips.length) {
        const t = tips[nodes.length]
        nodes.push({ x: t.p.x, y: t.p.y, vx: 0, vy: 0, tx: t.p.x, ty: t.p.y, hand: t.hand, i: t.i })
      }
      nodes.length = tips.length
      for (let i = 0; i < tips.length; i++) {
        nodes[i].tx = tips[i].p.x
        nodes[i].ty = tips[i].p.y
        nodes[i].hand = tips[i].hand
        nodes[i].i = tips[i].i
      }

      // springs: neighbour chain per hand + cross + bridge
      const springs: Spring[] = []
      const byHand: number[][] = [[], []]
      nodes.forEach((n, idx) => {
        if (n.hand < 2) byHand[n.hand].push(idx)
      })
      for (const group of byHand) {
        for (let i = 0; i < group.length - 1; i++) {
          springs.push({ a: group[i], b: group[i + 1], rest: 56 })
        }
        if (group.length >= 3) springs.push({ a: group[0], b: group[group.length - 1], rest: 72 })
        if (group.length >= 4) springs.push({ a: group[0], b: group[2], rest: 64 })
      }
      if (byHand[0].length && byHand[1].length) {
        springs.push({ a: byHand[0][0], b: byHand[1][0], rest: 160, bridge: true })
      }
      springsRef.current = springs
    }

    const nodes = nodesRef.current
    const fists = fistRef.current

    // spring forces
    let maxStrain = 0
    for (const s of springsRef.current) {
      const a = nodes[s.a]
      const b = nodes[s.b]
      if (!a || !b) continue
      const fist = Math.max(fists[a.hand] ?? 0, fists[b.hand] ?? 0)
      const rest = s.bridge ? s.rest : lerpRest(s.rest, fist)
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.hypot(dx, dy) || 1
      const strain = d - rest
      maxStrain = Math.max(maxStrain, Math.abs(strain))
      const f = strain * (s.bridge ? K * 0.25 : K) * dt
      const nx = dx / d
      const ny = dy / d
      a.vx += nx * f
      a.vy += ny * f
      b.vx -= nx * f
      b.vy -= ny * f
    }

    for (const n of nodes) {
      const fist = fists[n.hand] ?? 0
      // pull toward fingertip, stronger when open; when fist, pull to centroid
      const pull = 14 + (1 - fist) * 22
      n.vx += (n.tx - n.x) * pull * dt
      n.vy += (n.ty - n.y) * pull * dt
      // orbital swirl
      const ang = phase.current * (2.2 - fist) + n.i * 1.4 + n.hand * 2
      const r = ORBIT_R * (1 - fist * 0.85)
      n.vx += Math.cos(ang) * r * dt * 8
      n.vy += Math.sin(ang) * r * dt * 8
      n.vx *= DAMP
      n.vy *= DAMP
      n.x += n.vx
      n.y += n.vy
    }

    if (maxStrain > 70 && now - lastPluck.current > 220) {
      lastPluck.current = now
      const note = GLASS_SCALE[Math.min(5, Math.floor(maxStrain / 40))]
      audio?.bell(note, { bright: 0.55, dur: 1.2, gain: 0.35 })
    }
    audio?.setPadBrightness(0.2 + Math.min(1, maxStrain / 120) * 0.5)

    // draw
    drawDimWebcam(ctx, video, width, height, 0.22)
    ctx.fillStyle = 'rgba(6, 10, 18, 0.55)'
    ctx.fillRect(0, 0, width, height)

    // springs
    for (const s of springsRef.current) {
      const a = nodes[s.a]
      const b = nodes[s.b]
      if (!a || !b) continue
      const d = dist(a, b)
      const fist = Math.max(fists[a.hand] ?? 0, fists[b.hand] ?? 0)
      const tension = clamp(Math.abs(d - s.rest) / 80, 0, 1)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      if (s.bridge) {
        ctx.strokeStyle = `rgba(180,220,255,${0.15 + tension * 0.35})`
        ctx.setLineDash([4, 6])
        ctx.lineWidth = 1
      } else {
        ctx.setLineDash([])
        const hue = 190 + tension * 80
        ctx.strokeStyle = `hsla(${hue}, 80%, ${55 + fist * 20}%, ${0.35 + tension * 0.5})`
        ctx.lineWidth = 1.2 + tension * 2.2
      }
      ctx.stroke()
      ctx.setLineDash([])
    }

    // nodes + orbit rings
    for (const n of nodes) {
      const fist = fists[n.hand] ?? 0
      const r = 4 + (1 - fist) * 4
      ctx.beginPath()
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
      ctx.fillStyle = n.hand === 0 ? '#7ef0ff' : '#ffb0e8'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(n.x, n.y, ORBIT_R * (1 - fist * 0.7) + 6, phase.current * 2 + n.i, phase.current * 2 + n.i + Math.PI * 1.4)
      ctx.stroke()
    }

    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.fillStyle = 'rgba(200,230,255,0.55)'
    ctx.fillText(
      nodes.length ? 'open hand to bloom orbits · fist to collapse · two hands bridge' : 'show your hands to the camera',
      16,
      height - 16,
    )
  }, paused)

  return (
    <div className="relative size-full overflow-hidden bg-[#060a12]" onPointerDown={() => audioRef.current?.resume()}>
      <canvas ref={canvasRef} className="absolute inset-0 size-full touch-none" />
      <div className="absolute right-3 top-3">
        <SoundToggle muted={muted} onToggle={toggleMuted} />
      </div>
    </div>
  )
}

function lerpRest(rest: number, fist: number) {
  return rest * (1 - fist * 0.72) + 12 * fist
}

export default function OrbitLoom({ paused }: ExperimentProps) {
  return (
    <WebcamGate hint="fingertips weave elastic orbits — fist collapses, open blooms">
      {(video) => <Scene video={video} paused={paused} />}
    </WebcamGate>
  )
}

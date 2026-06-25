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

const STRAND_COUNT = 22 // vertical threads hanging across the screen
const PLUCK_R = 90 // how close (horizontally) a fingertip bends a thread
const GRAB_R = 70 // how close a pinch must be to grab a thread
const MAX_LINKS = 170 // cross-stitches cap — oldest dissolve first
const PINCH_ON = 42
const PINCH_OFF = 58

type HandId = 'left' | 'right'

interface Strand {
  x: number // resting column position
  curX: number // current pulled point
  curY: number
  touched: boolean // was a fingertip on it last frame (for pluck sound)
}

interface Link {
  a: number // strand index
  b: number
  y: number // height the stitch was tied at
  born: number
}

interface Hand {
  id: HandId
  index: Point
  pinchPoint: Point
  pinch: boolean
  energy: number
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

// x position of a plucked strand at height y (two straight segments through its pull point)
function strandXAt(s: Strand, y: number, height: number) {
  if (y <= s.curY) return lerp(s.x, s.curX, s.curY <= 0 ? 1 : y / s.curY)
  return lerp(s.curX, s.x, (y - s.curY) / Math.max(height - s.curY, 1))
}

function Scene({ video, paused }: { video: HTMLVideoElement } & ExperimentProps) {
  const { canvasRef, ctxRef, sizeRef } = useCanvas2D()
  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const handsRef = useRef<Hand[]>([])
  const prevIndexRef = useRef<Record<HandId, Point | null>>({ left: null, right: null })
  const grabbedRef = useRef<Record<HandId, number | null>>({ left: null, right: null })
  const pinchStateRef = useRef<Record<HandId, boolean>>({ left: false, right: false })
  const strandsRef = useRef<Strand[]>([])
  const strandWidthRef = useRef(0)
  const linksRef = useRef<Link[]>([])
  const lastDetect = useRef(0)
  const { audioRef, muted, toggleMuted } = useGlassAudio(paused, 0.45)

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

  useAnimationLoop((elapsed) => {
    const ctx = ctxRef.current
    if (!ctx) return
    const { width, height } = sizeRef.current
    if (!width || !height) return

    const now = performance.now()
    const audio = audioRef.current

    // build / rebuild the hanging strands on resize
    if (strandWidthRef.current !== width) {
      strandWidthRef.current = width
      strandsRef.current = Array.from({ length: STRAND_COUNT }, (_, i) => {
        const x = width * (0.08 + (i / (STRAND_COUNT - 1)) * 0.84)
        return { x, curX: x, curY: height / 2, touched: false }
      })
    }
    const strands = strandsRef.current
    const links = linksRef.current

    if (video.readyState >= 2 && video.videoWidth > 0) {
      drawDimWebcam(ctx, video, width, height, 0.92)
      ctx.fillStyle = 'rgba(8, 12, 18, 0.42)'
      ctx.fillRect(0, 0, width, height)
    } else {
      ctx.fillStyle = '#06090f'
      ctx.fillRect(0, 0, width, height)
    }

    // --- detect hands ---
    const lm = landmarkerRef.current
    if (lm && video.readyState >= 2 && video.videoWidth > 0 && now - lastDetect.current > 33) {
      const ts = now > lastDetect.current ? now : lastDetect.current + 1
      lastDetect.current = ts
      const res = lm.detectForVideo(video, ts)
      const raw = res.landmarks.map((landmarks) => ({
        thumb: mirroredPoint(landmarks[4], width, height),
        index: mirroredPoint(landmarks[8], width, height),
        palm: mirroredPoint(landmarks[0], width, height),
      }))
      raw.sort((a, b) => a.palm.x - b.palm.x)
      handsRef.current = raw.map((h, i) => {
        const id: HandId = i === 0 ? 'left' : 'right'
        const pinchDist = dist(h.thumb, h.index)
        const wasDown = pinchStateRef.current[id]
        const pinch = wasDown ? pinchDist < PINCH_OFF : pinchDist < PINCH_ON
        pinchStateRef.current[id] = pinch
        const prev = prevIndexRef.current[id]
        const energy = clamp(prev ? dist(h.index, prev) / 28 : 0, 0, 1)
        prevIndexRef.current[id] = { x: h.index.x, y: h.index.y }
        return {
          id,
          index: h.index,
          pinchPoint: { x: (h.thumb.x + h.index.x) / 2, y: (h.thumb.y + h.index.y) / 2 },
          pinch,
          energy,
        }
      })
      if (raw.length < 2) {
        const missing: HandId = raw.length === 0 ? 'left' : 'right'
        prevIndexRef.current[missing] = null
        pinchStateRef.current[missing] = false
        grabbedRef.current[missing] = null
      }
    }
    const hands = handsRef.current
    const indexTips = hands.map((h) => h.index)

    // --- pinch grabs a strand and drags it to neighbours, tying stitches ---
    for (const id of ['left', 'right'] as HandId[]) {
      const hand = hands.find((h) => h.id === id)
      if (!hand || !hand.pinch) {
        grabbedRef.current[id] = null
        continue
      }
      // nearest strand to the pinch (horizontal)
      let nearest = -1
      let best = GRAB_R
      for (let i = 0; i < strands.length; i++) {
        const d = Math.abs(strands[i].x - hand.pinchPoint.x)
        if (d < best) {
          best = d
          nearest = i
        }
      }
      if (nearest < 0) continue
      const held = grabbedRef.current[id]
      if (held === null) {
        grabbedRef.current[id] = nearest
      } else if (nearest !== held) {
        links.push({ a: held, b: nearest, y: hand.pinchPoint.y, born: now })
        if (links.length > MAX_LINKS) links.shift()
        grabbedRef.current[id] = nearest
        const pan = clamp((hand.pinchPoint.x / width) * 2 - 1, -1, 1)
        const note = clamp(
          Math.floor((1 - hand.pinchPoint.y / height) * GLASS_SCALE.length),
          0,
          GLASS_SCALE.length - 1,
        )
        audio?.bell(GLASS_SCALE[note], { bright: 0.74, dur: 1.8, gain: 0.26, pan })
      }
    }
    const grabbedIndices = new Set(
      Object.values(grabbedRef.current).filter((v): v is number => v !== null),
    )

    // --- move each strand toward its target (grabbed > plucked > resting) ---
    for (let i = 0; i < strands.length; i++) {
      const s = strands[i]
      let tx = s.x + Math.sin(elapsed * 0.6 + i) * 3
      let ty = height / 2
      let onIt = false

      // grabbed by a pinch?
      const grabber = hands.find((h) => grabbedRef.current[h.id] === i && h.pinch)
      if (grabber) {
        tx = grabber.pinchPoint.x
        ty = grabber.pinchPoint.y
        onIt = true
      } else if (!grabbedIndices.has(i)) {
        // pluck: bend toward the nearest fingertip in this column
        let strength = 0
        let fx = s.x
        let fy = ty
        for (const f of indexTips) {
          const k = clamp(1 - Math.abs(f.x - s.x) / PLUCK_R, 0, 1)
          if (k > strength) {
            strength = k
            fx = f.x
            fy = f.y
          }
        }
        if (strength > 0.05) {
          tx = lerp(s.x, fx, strength)
          ty = lerp(height / 2, fy, strength)
          onIt = strength > 0.4
        }
      }

      s.curX = lerp(s.curX, tx, 0.3)
      s.curY = lerp(s.curY, ty, 0.3)

      if (onIt && !s.touched) {
        audio?.sparkle(clamp((s.x / width) * 2 - 1, -1, 1))
      }
      s.touched = onIt
    }

    audio?.setPadBrightness(clamp(0.16 + (links.length / MAX_LINKS) * 0.5, 0, 1))

    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // --- cross stitches (the pattern you tie between threads) ---
    for (const link of links) {
      const a = strands[link.a]
      const b = strands[link.b]
      if (!a || !b) continue
      const fresh = clamp(1 - (now - link.born) / 600, 0, 1)
      const ax = strandXAt(a, link.y, height)
      const bx = strandXAt(b, link.y, height)
      ctx.strokeStyle = `rgba(255, 246, 214, ${0.3 + fresh * 0.5})`
      ctx.lineWidth = 1 + fresh * 1.2
      ctx.beginPath()
      ctx.moveTo(ax, link.y)
      ctx.lineTo(bx, link.y)
      ctx.stroke()
    }

    // --- hanging strands ---
    for (let i = 0; i < strands.length; i++) {
      const s = strands[i]
      const lit = s.touched || grabbedIndices.has(i)
      ctx.strokeStyle = lit ? 'rgba(190, 248, 255, 0.85)' : 'rgba(176, 226, 246, 0.4)'
      ctx.lineWidth = lit ? 1.6 : 1
      ctx.beginPath()
      ctx.moveTo(s.x, 0)
      ctx.lineTo(s.curX, s.curY)
      ctx.lineTo(s.x, height)
      ctx.stroke()
    }

    // --- fingertips ---
    for (const hand of hands) {
      ctx.shadowColor = hand.pinch ? 'rgba(255, 239, 186, 0.95)' : 'rgba(177, 245, 255, 0.75)'
      ctx.shadowBlur = hand.pinch ? 20 : 11
      ctx.fillStyle = hand.pinch ? '#fff1b8' : '#d8fff7'
      ctx.beginPath()
      ctx.arc(hand.index.x, hand.index.y, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
    }

    ctx.restore()

    // HUD
    ctx.save()
    ctx.fillStyle = 'rgba(7, 10, 16, 0.24)'
    ctx.fillRect(0, height - 44, width, 44)
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(224, 255, 246, 0.78)'
    ctx.fillText(
      hands.length
        ? 'brush the hanging threads - pinch one and drag to a neighbour to stitch them together'
        : 'show a hand to touch the hanging threads',
      18,
      height - 18,
    )
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(255, 242, 197, 0.7)'
    ctx.fillText(`${links.length} stitches`, width - 18, height - 18)
    ctx.restore()
  }, paused)

  return (
    <div
      className="relative size-full overflow-hidden bg-black"
      onPointerDown={() => audioRef.current?.resume()}
    >
      <canvas ref={canvasRef} className="absolute inset-0 size-full touch-none" />
      <div className="absolute right-3 top-3">
        <SoundToggle muted={muted} onToggle={toggleMuted} />
      </div>
    </div>
  )
}

export default function TwoHandLoom({ paused }: ExperimentProps) {
  return (
    <WebcamGate hint="brush the hanging threads with your fingers - pinch one and drag it onto a neighbour to stitch them together">
      {(video) => <Scene video={video} paused={paused} />}
    </WebcamGate>
  )
}

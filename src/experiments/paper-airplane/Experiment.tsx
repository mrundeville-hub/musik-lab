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
import { dist, drawDimWebcam, mirroredPoint, type Point } from '../_shared/asciiTools'

const DETECT_MS = 33
const PINCH_ON = 42
const PINCH_OFF = 58
const MAX_PLANES = 6
const TEX = 64

interface Plane {
  x: number
  y: number
  vx: number
  vy: number
  angle: number
  spin: number
  life: number
  tex: HTMLCanvasElement
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
  const faceRef = useRef<FaceLandmarker | null>(null)
  const lastDetect = useRef(0)
  const handsRef = useRef<{ mid: Point; gap: number; pinch: boolean; prev: Point | null }[]>([])
  const pinchPrev = useRef([false, false])
  const faceCenter = useRef<Point | null>(null)
  const planesRef = useRef<Plane[]>([])
  const heldRef = useRef<{ hand: number; tex: HTMLCanvasElement } | null>(null)
  const { audioRef, muted, toggleMuted } = useGlassAudio(paused, 0.35)

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

  const grabFaceTex = (width: number, height: number) => {
    const tex = document.createElement('canvas')
    tex.width = TEX
    tex.height = TEX
    const tctx = tex.getContext('2d')!
    const fc = faceCenter.current
    if (!fc || video.readyState < 2) {
      tctx.fillStyle = '#d4c4a8'
      tctx.fillRect(0, 0, TEX, TEX)
      return tex
    }
    const vw = video.videoWidth
    const vh = video.videoHeight
    const crop = Math.min(vw, vh) * 0.35
    const vx = (1 - fc.x / width) * vw
    const vy = (fc.y / height) * vh
    tctx.save()
    tctx.scale(-1, 1)
    tctx.drawImage(video, vx - crop / 2, vy - crop / 2, crop, crop, -TEX, 0, TEX, TEX)
    tctx.restore()
    return tex
  }

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
      const hand = handRef.current
      if (hand) {
        const res = hand.detectForVideo(video, ts)
        const raw = res.landmarks.map((l) => {
          const thumb = mirroredPoint(l[4], width, height)
          const index = mirroredPoint(l[8], width, height)
          return {
            mid: { x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 },
            gap: dist(thumb, index),
            palmX: (1 - l[0].x) * width,
          }
        })
        raw.sort((a, b) => a.palmX - b.palmX)
        handsRef.current = raw.map((h, i) => {
          const was = pinchPrev.current[i] ?? false
          const pinch = was ? h.gap < PINCH_OFF : h.gap < PINCH_ON
          pinchPrev.current[i] = pinch
          const prev = handsRef.current[i]?.mid ?? null
          return { mid: h.mid, gap: h.gap, pinch, prev }
        })
        for (let i = raw.length; i < 2; i++) pinchPrev.current[i] = false
      }
      const face = faceRef.current?.detectForVideo(video, ts).faceLandmarks[0]
      if (face) {
        const nose = face[1]
        faceCenter.current = { x: (1 - nose.x) * width, y: nose.y * height }
      }
    }

    drawDimWebcam(ctx, video, width, height, 0.55)
    ctx.fillStyle = 'rgba(10, 14, 22, 0.35)'
    ctx.fillRect(0, 0, width, height)

    const hands = handsRef.current
    // wind from non-pinching hand motion
    let windX = 0
    let windY = 0
    for (const h of hands) {
      if (!h.pinch && h.prev) {
        windX += (h.mid.x - h.prev.x) * 8
        windY += (h.mid.y - h.prev.y) * 8
      }
    }

    // fold / launch
    for (let i = 0; i < hands.length; i++) {
      const h = hands[i]
      if (h.pinch && !heldRef.current) {
        // near face to fold
        const fc = faceCenter.current
        if (fc && dist(h.mid, fc) < 160) {
          heldRef.current = { hand: i, tex: grabFaceTex(width, height) }
          audio?.sparkle(clamp((h.mid.x / width) * 2 - 1, -1, 1))
        }
      }
      if (heldRef.current?.hand === i) {
        if (h.pinch) {
          // show held plane at pinch
          drawPlane(ctx, h.mid.x, h.mid.y, -0.4, heldRef.current.tex, 1)
        } else {
          // launch on release with flick velocity
          const prev = h.prev
          const vx = prev ? (h.mid.x - prev.x) * 28 : 200
          const vy = prev ? (h.mid.y - prev.y) * 28 - 80 : -120
          if (planesRef.current.length < MAX_PLANES) {
            planesRef.current.push({
              x: h.mid.x,
              y: h.mid.y,
              vx,
              vy,
              angle: Math.atan2(vy, vx),
              spin: (Math.random() - 0.5) * 2,
              life: 1,
              tex: heldRef.current.tex,
            })
            audio?.flourish(true)
          }
          heldRef.current = null
        }
      }
    }

    // simulate planes
    for (const p of planesRef.current) {
      p.vx += windX * delta
      p.vy += windY * delta + 45 * delta // gravity
      p.vx *= 0.995
      p.x += p.vx * delta
      p.y += p.vy * delta
      p.angle = lerp(p.angle, Math.atan2(p.vy, p.vx), 0.1)
      p.spin *= 0.98
      p.angle += p.spin * delta
      p.life -= delta * 0.08
      if (p.y > height - 20) {
        p.y = height - 20
        p.vy *= -0.2
        p.vx *= 0.7
        if (Math.abs(p.vy) < 20) {
          p.life -= delta * 0.5
          if (p.life > 0.5) audio?.bell(GLASS_SCALE[1], { bright: 0.3, dur: 0.8, gain: 0.12 })
        }
      }
      drawPlane(ctx, p.x, p.y, p.angle, p.tex, clamp(p.life, 0, 1))
    }
    planesRef.current = planesRef.current.filter((p) => p.life > 0 && p.x > -80 && p.x < width + 80)

    // fingertips
    for (const h of hands) {
      ctx.fillStyle = h.pinch ? '#fff1b8' : '#d8fff7'
      ctx.beginPath()
      ctx.arc(h.mid.x, h.mid.y, 5, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.fillStyle = 'rgba(220,235,255,0.55)'
    ctx.fillText(
      heldRef.current ? 'flick to launch · other hand waves wind' : 'pinch near your face to fold a plane from your skin',
      16,
      height - 16,
    )
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

function drawPlane(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  tex: HTMLCanvasElement,
  alpha: number,
) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x, y)
  ctx.rotate(angle)
  // paper body with face texture clipped to dart shape
  ctx.beginPath()
  ctx.moveTo(28, 0)
  ctx.lineTo(-18, -12)
  ctx.lineTo(-10, 0)
  ctx.lineTo(-18, 12)
  ctx.closePath()
  ctx.clip()
  ctx.drawImage(tex, -22, -14, 50, 28)
  ctx.restore()

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(28, 0)
  ctx.lineTo(-18, -12)
  ctx.lineTo(-10, 0)
  ctx.lineTo(-18, 12)
  ctx.closePath()
  ctx.stroke()
  // center crease
  ctx.beginPath()
  ctx.moveTo(28, 0)
  ctx.lineTo(-10, 0)
  ctx.stroke()
  ctx.restore()
}

export default function PaperAirplane({ paused }: ExperimentProps) {
  return (
    <WebcamGate hint="pinch near your face to fold a paper airplane, then flick to launch">
      {(video) => <Scene video={video} paused={paused} />}
    </WebcamGate>
  )
}

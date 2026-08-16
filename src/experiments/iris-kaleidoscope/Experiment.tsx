import { useEffect, useRef } from 'react'
import type { FaceLandmarker } from '@mediapipe/tasks-vision'
import { WebcamGate } from '@/shared/components/WebcamGate'
import { SoundToggle } from '@/shared/components/SoundToggle'
import type { ExperimentProps } from '@/shared/types'
import { useAnimationLoop } from '@/shared/hooks/useAnimationLoop'
import { useCanvas2D } from '@/shared/hooks/useCanvas2D'
import { useGlassAudio } from '@/shared/hooks/useGlassAudio'
import { GLASS_SCALE } from '@/shared/lib/glassAudio'
import { createFaceLandmarker } from '@/shared/lib/mediapipe'

const WEDGES = 8
const DETECT_MS = 40
const SRC = 256 // offscreen crop size

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function Scene({ video, paused }: { video: HTMLVideoElement } & ExperimentProps) {
  const { canvasRef, ctxRef, sizeRef } = useCanvas2D()
  const faceRef = useRef<FaceLandmarker | null>(null)
  const lastDetect = useRef(0)
  const eyesRef = useRef<{ lx: number; ly: number; rx: number; ry: number; blink: number } | null>(null)
  const rotRef = useRef(0)
  const seedRef = useRef(0)
  const wasBlink = useRef(false)
  const srcCanvas = useRef<HTMLCanvasElement | null>(null)
  const { audioRef, muted, toggleMuted } = useGlassAudio(paused, 0.45)

  useEffect(() => {
    let alive = true
    void createFaceLandmarker().then((lm) => {
      if (alive) faceRef.current = lm
      else lm.close()
    })
    return () => {
      alive = false
      faceRef.current?.close()
      faceRef.current = null
    }
  }, [])

  useAnimationLoop(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    const { width, height } = sizeRef.current
    if (!width || !height) return
    const now = performance.now()
    const audio = audioRef.current

    if (video.readyState >= 2 && video.videoWidth > 0 && now - lastDetect.current > DETECT_MS) {
      const ts = now > lastDetect.current ? now : lastDetect.current + 1
      lastDetect.current = ts
      const face = faceRef.current?.detectForVideo(video, ts).faceLandmarks[0]
      if (face) {
        // iris / eye centers (MediaPipe face mesh)
        const left = face[468] ?? face[33]
        const right = face[473] ?? face[263]
        const lUpper = face[159]
        const lLower = face[145]
        const rUpper = face[386]
        const rLower = face[374]
        const lOpen = Math.hypot((lUpper.x - lLower.x) * width, (lUpper.y - lLower.y) * height)
        const rOpen = Math.hypot((rUpper.x - rLower.x) * width, (rUpper.y - rLower.y) * height)
        const eyeSpan = Math.hypot((right.x - left.x) * width, (right.y - left.y) * height) || 1
        const blink = 1 - clamp(((lOpen + rOpen) / 2) / (eyeSpan * 0.12), 0, 1)
        eyesRef.current = {
          lx: (1 - left.x) * width,
          ly: left.y * height,
          rx: (1 - right.x) * width,
          ry: right.y * height,
          blink,
        }
      } else {
        eyesRef.current = null
      }
    }

    const eyes = eyesRef.current
    ctx.fillStyle = '#05060a'
    ctx.fillRect(0, 0, width, height)

    if (!eyes || video.readyState < 2) {
      ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx.fillStyle = 'rgba(220,210,255,0.55)'
      ctx.fillText('look into the camera — your eyes become the kaleidoscope hubs', 16, height - 16)
      return
    }

    // blink reseeds
    const blinking = eyes.blink > 0.55
    if (blinking && !wasBlink.current) {
      seedRef.current = (seedRef.current + 1) % 7
      audio?.chord(GLASS_SCALE[seedRef.current % GLASS_SCALE.length], { bright: 0.65, dur: 1.8, gain: 0.28 })
    }
    wasBlink.current = blinking

    const cx = (eyes.lx + eyes.rx) / 2
    const cy = (eyes.ly + eyes.ry) / 2
    const gazeAngle = Math.atan2(eyes.ry - eyes.ly, eyes.rx - eyes.lx)
    rotRef.current = lerp(rotRef.current, gazeAngle + seedRef.current * 0.4, 0.08)
    audio?.setPadBrightness(clamp(0.25 + (1 - eyes.blink) * 0.4, 0, 1))

    // downsample a crop around the eyes from the mirrored webcam
    let sc = srcCanvas.current
    if (!sc) sc = srcCanvas.current = document.createElement('canvas')
    if (sc.width !== SRC) {
      sc.width = SRC
      sc.height = SRC
    }
    const sctx = sc.getContext('2d')!
    // video is mirrored in display space: sample around eye midpoint in video coords
    const vw = video.videoWidth
    const vh = video.videoHeight
    const crop = Math.min(vw, vh) * 0.55
    const vx = (1 - cx / width) * vw // un-mirror for source
    const vy = (cy / height) * vh
    sctx.save()
    sctx.translate(SRC / 2, SRC / 2)
    sctx.rotate(rotRef.current + seedRef.current * 0.15)
    sctx.scale(-1, 1)
    sctx.drawImage(video, vx - crop / 2, vy - crop / 2, crop, crop, -SRC / 2, -SRC / 2, SRC, SRC)
    sctx.restore()

    // draw kaleidoscope wedges centered on screen mid (and lightly on each iris)
    const R = Math.min(width, height) * 0.48
    const drawKaleido = (ox: number, oy: number, radius: number, alpha: number) => {
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.translate(ox, oy)
      ctx.rotate(rotRef.current)
      for (let i = 0; i < WEDGES; i++) {
        ctx.save()
        ctx.rotate((i * Math.PI * 2) / WEDGES)
        if (i % 2 === 1) ctx.scale(1, -1)
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.arc(0, 0, radius, -Math.PI / WEDGES, Math.PI / WEDGES)
        ctx.closePath()
        ctx.clip()
        ctx.drawImage(sc, -radius, -radius, radius * 2, radius * 2)
        ctx.restore()
      }
      ctx.restore()
    }

    drawKaleido(width / 2, height / 2, R, 0.92)
    drawKaleido(eyes.lx, eyes.ly, R * 0.28, 0.55)
    drawKaleido(eyes.rx, eyes.ry, R * 0.28, 0.55)

    // iris markers
    for (const p of [
      { x: eyes.lx, y: eyes.ly },
      { x: eyes.rx, y: eyes.ry },
    ]) {
      ctx.strokeStyle = 'rgba(255,240,255,0.7)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(p.x, p.y, 8 + (1 - eyes.blink) * 4, 0, Math.PI * 2)
      ctx.stroke()
    }

    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.fillStyle = 'rgba(230,220,255,0.55)'
    ctx.fillText('look around to spin · blink to reshuffle the crystal', 16, height - 16)
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

export default function IrisKaleidoscope({ paused }: ExperimentProps) {
  return (
    <WebcamGate hint="look into the camera — your pupils become kaleidoscope hubs">
      {(video) => <Scene video={video} paused={paused} />}
    </WebcamGate>
  )
}

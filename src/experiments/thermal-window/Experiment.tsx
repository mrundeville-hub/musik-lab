import { useEffect, useMemo, useRef, useState } from 'react'
import type { HandLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision'

import { WebcamGate } from '@/shared/components/WebcamGate'
import { createHandLandmarker } from '@/shared/lib/mediapipe'
import { GLASS_SCALE } from '@/shared/lib/glassAudio'
import { useGlassAudio } from '@/shared/hooks/useGlassAudio'
import { SoundToggle } from '@/shared/components/SoundToggle'
import type { ExperimentProps } from '@/shared/types'

type Point = { x: number; y: number }

type HandState = {
  handedness: 'Left' | 'Right' | 'Unknown'
  index: Point
  thumb: Point
  palm: Point
}

type ThermalRect = {
  x: number
  y: number
  width: number
  height: number
}

type ThermalQuad = {
  topLeft: Point
  topRight: Point
  bottomRight: Point
  bottomLeft: Point
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function lerp(current: number, target: number, amount: number) {
  return current + (target - current) * amount
}

function swapSelfieHandedness(handedness: HandState['handedness']): HandState['handedness'] {
  if (handedness === 'Left') return 'Right'
  if (handedness === 'Right') return 'Left'
  return handedness
}

function makeHandState(
  landmarks: NormalizedLandmark[],
  handedness: HandState['handedness'],
  width: number,
  height: number,
): HandState {
  const toCanvasPoint = (lm: NormalizedLandmark): Point => ({
    x: (1 - lm.x) * width,
    y: lm.y * height,
  })

  return {
    handedness,
    index: toCanvasPoint(landmarks[8]),
    thumb: toCanvasPoint(landmarks[4]),
    palm: toCanvasPoint(landmarks[9]),
  }
}

function getWindowQuad(hands: HandState[], width: number, height: number): ThermalQuad | null {
  if (hands.length < 2) return null

  const sorted = [...hands].sort((a, b) => a.palm.x - b.palm.x)
  const left = sorted[0]
  const right = sorted[sorted.length - 1]

  const sideFor = (hand: HandState) =>
    hand.index.y <= hand.thumb.y
      ? { top: hand.index, bottom: hand.thumb }
      : { top: hand.thumb, bottom: hand.index }
  const leftSide = sideFor(left)
  const rightSide = sideFor(right)
  const fit = (point: Point): Point => ({
    x: clamp(point.x, 0, width),
    y: clamp(point.y, 0, height),
  })

  return {
    topLeft: fit(leftSide.top),
    topRight: fit(rightSide.top),
    bottomRight: fit(rightSide.bottom),
    bottomLeft: fit(leftSide.bottom),
  }
}

function smoothPoint(current: Point, target: Point, amount: number): Point {
  return {
    x: lerp(current.x, target.x, amount),
    y: lerp(current.y, target.y, amount),
  }
}

function smoothQuad(current: ThermalQuad | null, target: ThermalQuad | null): ThermalQuad | null {
  if (!target) return null
  if (!current) return target

  return {
    topLeft: smoothPoint(current.topLeft, target.topLeft, 0.3),
    topRight: smoothPoint(current.topRight, target.topRight, 0.3),
    bottomRight: smoothPoint(current.bottomRight, target.bottomRight, 0.3),
    bottomLeft: smoothPoint(current.bottomLeft, target.bottomLeft, 0.3),
  }
}

function getQuadBounds(quad: ThermalQuad): ThermalRect {
  const xs = [quad.topLeft.x, quad.topRight.x, quad.bottomRight.x, quad.bottomLeft.x]
  const ys = [quad.topLeft.y, quad.topRight.y, quad.bottomRight.y, quad.bottomLeft.y]
  const x = Math.min(...xs)
  const y = Math.min(...ys)

  return {
    x,
    y,
    width: Math.max(1, Math.max(...xs) - x),
    height: Math.max(1, Math.max(...ys) - y),
  }
}

function thermalColor(value: number) {
  const v = clamp(value, 0, 255) / 255
  const stops = [
    [8, 0, 24],
    [34, 0, 92],
    [0, 92, 180],
    [0, 196, 167],
    [246, 228, 64],
    [255, 88, 28],
    [255, 245, 214],
  ]
  const scaled = v * (stops.length - 1)
  const index = Math.min(stops.length - 2, Math.floor(scaled))
  const mix = scaled - index
  const a = stops[index]
  const b = stops[index + 1]

  return [
    Math.round(lerp(a[0], b[0], mix)),
    Math.round(lerp(a[1], b[1], mix)),
    Math.round(lerp(a[2], b[2], mix)),
  ]
}

function drawMirroredVideo(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
) {
  ctx.save()
  ctx.translate(width, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(video, 0, 0, width, height)
  ctx.restore()
}

function drawThermalWindow(
  ctx: CanvasRenderingContext2D,
  thermalCtx: CanvasRenderingContext2D,
  quad: ThermalQuad,
  canvasWidth: number,
  canvasHeight: number,
  time: number,
) {
  const rect = getQuadBounds(quad)
  const sourceX = Math.floor(clamp(rect.x, 0, canvasWidth - 1))
  const sourceY = Math.floor(clamp(rect.y, 0, canvasHeight - 1))
  const sourceWidth = Math.max(1, Math.ceil(clamp(rect.width, 1, canvasWidth - sourceX)))
  const sourceHeight = Math.max(1, Math.ceil(clamp(rect.height, 1, canvasHeight - sourceY)))
  const thermalCanvas = thermalCtx.canvas

  if (thermalCanvas.width !== sourceWidth) thermalCanvas.width = sourceWidth
  if (thermalCanvas.height !== sourceHeight) thermalCanvas.height = sourceHeight

  const image = ctx.getImageData(sourceX, sourceY, sourceWidth, sourceHeight)
  const data = image.data
  const pulse = Math.sin(time * 0.004) * 10

  for (let y = 0; y < sourceHeight; y += 1) {
    for (let x = 0; x < sourceWidth; x += 1) {
      const i = (y * sourceWidth + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const luma = r * 0.28 + g * 0.58 + b * 0.14
      const scan = ((y % 5) - 2) * 4
      const heat = clamp(luma * 1.18 + pulse + scan + Math.sin((x + time * 0.02) * 0.21) * 9, 0, 255)
      const [tr, tg, tb] = thermalColor(heat)
      data[i] = tr
      data[i + 1] = tg
      data[i + 2] = tb
      data[i + 3] = 255
    }
  }

  thermalCtx.putImageData(image, 0, 0)

  ctx.save()
  ctx.beginPath()
  ctx.moveTo(quad.topLeft.x, quad.topLeft.y)
  ctx.lineTo(quad.topRight.x, quad.topRight.y)
  ctx.lineTo(quad.bottomRight.x, quad.bottomRight.y)
  ctx.lineTo(quad.bottomLeft.x, quad.bottomLeft.y)
  ctx.closePath()
  ctx.clip()
  ctx.drawImage(thermalCanvas, sourceX, sourceY)

  ctx.globalCompositeOperation = 'screen'
  ctx.fillStyle = 'rgba(255, 72, 20, 0.13)'
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.strokeStyle = 'rgba(255,245,214,0.92)'
  ctx.lineWidth = 2
  ctx.shadowColor = 'rgba(255,80,24,0.8)'
  ctx.shadowBlur = 16
  ctx.beginPath()
  ctx.moveTo(quad.topLeft.x, quad.topLeft.y)
  ctx.lineTo(quad.topRight.x, quad.topRight.y)
  ctx.lineTo(quad.bottomRight.x, quad.bottomRight.y)
  ctx.lineTo(quad.bottomLeft.x, quad.bottomLeft.y)
  ctx.closePath()
  ctx.stroke()

  ctx.shadowBlur = 0
  ctx.strokeStyle = 'rgba(0,255,196,0.65)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(quad.topLeft.x, quad.topLeft.y)
  ctx.lineTo(quad.topRight.x, quad.topRight.y)
  ctx.lineTo(quad.bottomRight.x, quad.bottomRight.y)
  ctx.lineTo(quad.bottomLeft.x, quad.bottomLeft.y)
  ctx.closePath()
  ctx.stroke()
  ctx.restore()
}

function drawHands(ctx: CanvasRenderingContext2D, hands: HandState[]) {
  for (const hand of hands) {
    ctx.strokeStyle = hand.handedness === 'Left' ? 'rgba(0,255,196,0.86)' : 'rgba(255,198,70,0.86)'
    ctx.fillStyle = ctx.strokeStyle
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(hand.index.x, hand.index.y)
    ctx.lineTo(hand.thumb.x, hand.thumb.y)
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(hand.index.x, hand.index.y, 5, 0, Math.PI * 2)
    ctx.arc(hand.thumb.x, hand.thumb.y, 5, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawStatus(ctx: CanvasRenderingContext2D, width: number, height: number, ready: boolean, hands: number) {
  ctx.save()
  ctx.fillStyle = 'rgba(5,8,10,0.44)'
  ctx.fillRect(0, height - 30, width, 30)
  ctx.fillStyle = 'rgba(255,255,255,0.76)'
  ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillText(ready ? `HANDS ${hands}/2` : 'LOADING HAND TRACKER', 14, height - 15)
  ctx.textAlign = 'right'
  ctx.fillText(hands >= 2 ? 'THERMAL FIELD ACTIVE' : 'SHOW BOTH HANDS', width - 14, height - 15)
  ctx.restore()
}

function ThermalWindowStage({ video, paused }: { video: HTMLVideoElement; paused: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const rafRef = useRef(0)
  const handsRef = useRef<HandState[]>([])
  const quadRef = useRef<ThermalQuad | null>(null)
  const thermalCanvas = useMemo(() => document.createElement('canvas'), [])
  const [ready, setReady] = useState(false)
  const { audioRef, muted, toggleMuted } = useGlassAudio(paused, 0.8)
  const wasOpenRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    createHandLandmarker(2).then((landmarker) => {
      if (cancelled) {
        landmarker.close()
        return
      }
      landmarkerRef.current = landmarker
      setReady(true)
    })

    return () => {
      cancelled = true
      landmarkerRef.current?.close()
      landmarkerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!ready || paused) {
      handsRef.current = []
      return
    }

    let cancelled = false
    let rvfcHandle = 0
    let intervalHandle = 0
    const supportsRvfc = 'requestVideoFrameCallback' in video

    const detect = (now: number) => {
      const landmarker = landmarkerRef.current
      const canvas = canvasRef.current
      if (!landmarker || !canvas || video.readyState < 2) return

      const width = Math.max(1, canvas.width)
      const height = Math.max(1, canvas.height)
      const result = landmarker.detectForVideo(video, now)
      handsRef.current =
        result?.landmarks.map((landmarks, index) => {
          const category = result.handednesses[index]?.[0]?.categoryName
          const rawHandedness = category === 'Left' || category === 'Right' ? category : 'Unknown'
          return makeHandState(landmarks, swapSelfieHandedness(rawHandedness), width, height)
        }) ?? []
    }

    if (supportsRvfc) {
      const loop = (now: number) => {
        if (cancelled) return
        detect(now)
        rvfcHandle = (video as HTMLVideoElement & {
          requestVideoFrameCallback: (cb: (now: number) => void) => number
        }).requestVideoFrameCallback(loop)
      }
      rvfcHandle = (video as HTMLVideoElement & {
        requestVideoFrameCallback: (cb: (now: number) => void) => number
      }).requestVideoFrameCallback(loop)
    } else {
      intervalHandle = window.setInterval(() => {
        if (!cancelled) detect(performance.now())
      }, 33)
    }

    return () => {
      cancelled = true
      if (rvfcHandle) {
        ;(video as HTMLVideoElement & {
          cancelVideoFrameCallback?: (handle: number) => void
        }).cancelVideoFrameCallback?.(rvfcHandle)
      }
      if (intervalHandle) clearInterval(intervalHandle)
    }
  }, [paused, ready, video])

  useEffect(() => {
    const draw = (now: number) => {
      rafRef.current = requestAnimationFrame(draw)

      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d', { alpha: false })
      const thermalCtx = thermalCanvas.getContext('2d', { willReadFrequently: true })
      if (!canvas || !ctx || !thermalCtx || video.readyState < 2) return

      const rect = canvas.getBoundingClientRect()
      const width = Math.max(1, Math.floor(rect.width))
      const height = Math.max(1, Math.floor(rect.height))
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height

      const hands = paused ? [] : handsRef.current
      const targetQuad = getWindowQuad(hands, width, height)
      quadRef.current = smoothQuad(quadRef.current, targetQuad)

      drawMirroredVideo(ctx, video, width, height)

      ctx.save()
      ctx.fillStyle = 'rgba(0,0,0,0.12)'
      ctx.fillRect(0, 0, width, height)
      ctx.restore()

      // the thermal window opening (both hands frame it) is the key interaction
      const open = hands.length >= 2 && !!targetQuad
      if (open && !wasOpenRef.current && quadRef.current) {
        const cx = (quadRef.current.topLeft.x + quadRef.current.topRight.x) / 2
        const pan = Math.max(-1, Math.min(1, (cx / width) * 2 - 1))
        audioRef.current?.chord(GLASS_SCALE[3], { bright: 0.85, dur: 3.6, gain: 0.36, pan })
      }
      wasOpenRef.current = open

      if (quadRef.current) {
        drawThermalWindow(ctx, thermalCtx, quadRef.current, width, height, now)
      }

      drawHands(ctx, hands)
      drawStatus(ctx, width, height, ready, Math.min(2, hands.length))
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [paused, ready, thermalCanvas, video, audioRef])

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,transparent_52%,rgba(0,0,0,0.36)_100%)]" />
      <div className="pointer-events-none absolute left-3 top-3 rounded-[5px] border border-white/20 bg-black/35 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-white/78 backdrop-blur">
        thermal-window
      </div>
      <SoundToggle muted={muted} onToggle={toggleMuted} />
    </div>
  )
}

export default function Experiment({ paused }: ExperimentProps) {
  return (
    <WebcamGate hint="enable camera, then bring both index fingers and thumbs into frame to open the thermal window">
      {(video) => <ThermalWindowStage video={video} paused={paused} />}
    </WebcamGate>
  )
}

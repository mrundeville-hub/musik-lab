import { useEffect, useRef } from 'react'
import type { FaceLandmarker, HandLandmarker } from '@mediapipe/tasks-vision'

import { WebcamGate } from '@/shared/components/WebcamGate'
import type { ExperimentProps } from '@/shared/types'
import { useAnimationLoop } from '@/shared/hooks/useAnimationLoop'
import { useCanvas2D } from '@/shared/hooks/useCanvas2D'
import {
  createFaceLandmarker,
  createHandLandmarker,
} from '@/shared/lib/mediapipe'

import { distanceBetween, isPinching, type Point } from './interaction'

const DETECT_INTERVAL_MS = 33
const GRAB_RADIUS = 78
const MOUTH_RADIUS = 76
const MAX_SMOKE = 260
const PIXEL = 3

type HandState = {
  thumb: Point
  index: Point
  middle: Point
  pinchPoint: Point
  pinchAngle: number
  pinching: boolean
}

type Cigarette = {
  x: number
  y: number
  angle: number
  heldBy: number | null
  atMouth: boolean
  inhaling: boolean
  inhaled: boolean
  inhalePower: number
  burn: number
  mouthContact: Point | null
  noseContact: Point | null
}

type SmokePixel = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  phase: number
}

function randomCigarette(width: number, height: number): Cigarette {
  return {
    x: width * (0.22 + Math.random() * 0.56),
    y: height * (0.64 + Math.random() * 0.2),
    angle: 0,
    heldBy: null,
    atMouth: false,
    inhaling: false,
    inhaled: false,
    inhalePower: 0,
    burn: 0,
    mouthContact: null,
    noseContact: null,
  }
}

function drawWebcamCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
) {
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
    ctx.fillStyle = '#111116'
    ctx.fillRect(0, 0, width, height)
    return
  }
  const scale = Math.max(width / video.videoWidth, height / video.videoHeight)
  const drawWidth = video.videoWidth * scale
  const drawHeight = video.videoHeight * scale
  ctx.save()
  ctx.translate(width, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(
    video,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  )
  ctx.restore()
}

function pixelRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  ctx.fillRect(
    Math.round(x / PIXEL) * PIXEL,
    Math.round(y / PIXEL) * PIXEL,
    width,
    height,
  )
}

function drawCigarette(
  ctx: CanvasRenderingContext2D,
  cigarette: Cigarette,
  elapsed: number,
) {
  ctx.save()
  ctx.translate(Math.round(cigarette.x), Math.round(cigarette.y))
  ctx.rotate(cigarette.angle)
  ctx.imageSmoothingEnabled = false

  // Only the white tobacco section burns away. The filter stays full-size at x=36.
  const burnScale = Math.max(0.6, 1 - cigarette.burn * 0.8)
  const bodyStart = 12 + (-36 - 12) * burnScale
  const bodyWidth = 12 - bodyStart
  const emberStart = bodyStart - 7

  // Dark outline gives the pixel sprite definition without a cast shadow.
  ctx.fillStyle = '#27141a'
  pixelRect(ctx, emberStart, -6, 46 - emberStart, 15)

  // Lower cylindrical face for the 3D roll.
  ctx.fillStyle = '#b8bcb6'
  pixelRect(ctx, bodyStart, 2, 33 - bodyStart, 6)
  ctx.fillStyle = '#8d948e'
  pixelRect(ctx, bodyStart, 5, 33 - bodyStart, 3)

  // White paper top face shortens toward the fixed filter.
  ctx.fillStyle = '#e9ece5'
  pixelRect(ctx, bodyStart, -4, bodyWidth, 7)
  ctx.fillStyle = '#fbfcf6'
  pixelRect(ctx, bodyStart + 3, -4, Math.max(3, bodyWidth - 9), 4)
  ctx.fillStyle = '#ffffff'
  pixelRect(ctx, bodyStart + 6, -3, Math.max(3, bodyWidth - 15), 2)
  ctx.fillStyle = '#c9cec4'
  pixelRect(ctx, bodyStart + bodyWidth * 0.38, -4, 3, 7)
  pixelRect(ctx, bodyStart + bodyWidth * 0.82, -4, 3, 7)

  // Filter keeps its original dimensions and position at the fingertips.
  ctx.fillStyle = '#a5674b'
  pixelRect(ctx, 12, -4, 24, 7)
  ctx.fillStyle = '#d89b63'
  pixelRect(ctx, 15, -4, 18, 4)
  ctx.fillStyle = '#edb878'
  pixelRect(ctx, 18, -3, 12, 2)
  ctx.fillStyle = '#7e4b40'
  pixelRect(ctx, 12, -4, 3, 7)
  pixelRect(ctx, 30, -4, 3, 7)

  // The ember advances as the paper is consumed.
  ctx.fillStyle = '#3a2930'
  pixelRect(ctx, emberStart, -5, 7, 9)
  if (cigarette.inhaling) {
    const glow = 0.35 + (Math.sin(elapsed * 8) + 1) * 0.16
    ctx.fillStyle = `rgba(255, 92, 40, ${glow})`
    pixelRect(ctx, emberStart - 8, -10, 6, 20)
  }
  ctx.fillStyle = '#ff573e'
  pixelRect(ctx, emberStart + 4, -4, 6, 8)
  ctx.fillStyle =
    cigarette.inhaling || elapsed % 0.24 < 0.12 ? '#ffe08a' : '#ff8c42'
  pixelRect(ctx, emberStart - 2, -2, 3, 5)
  ctx.fillStyle = cigarette.inhaling
    ? 'rgba(255, 164, 66, 0.78)'
    : 'rgba(255, 115, 58, 0.32)'
  pixelRect(ctx, emberStart - 5, -5, 3, 11)

  if (cigarette.heldBy !== null) {
    ctx.fillStyle = 'rgba(255, 210, 112, 0.5)'
    pixelRect(ctx, 33, -8, 3, 17)
  }
  ctx.restore()
}

function spawnSmoke(
  smoke: SmokePixel[],
  origin: Point,
  angle: number,
  now: number,
  count = 36,
) {
  const drift = Math.cos(angle) * 8
  for (let i = 0; i < count; i++) {
    const maxLife = 0.9 + Math.random() * 1.5
    smoke.push({
      x: origin.x + (Math.random() - 0.5) * 8,
      y: origin.y + (Math.random() - 0.5) * 6,
      vx: drift + (Math.random() - 0.5) * 14,
      vy: -(18 + Math.random() * 30),
      life: maxLife,
      maxLife,
      size: PIXEL * (1 + Math.floor(Math.random() * 2)),
      phase: now * 0.002 + Math.random() * Math.PI * 2,
    })
  }
  if (smoke.length > MAX_SMOKE) smoke.splice(0, smoke.length - MAX_SMOKE)
}

function drawSmoke(
  ctx: CanvasRenderingContext2D,
  smoke: SmokePixel[],
  elapsed: number,
  delta: number,
) {
  ctx.save()
  ctx.imageSmoothingEnabled = false
  for (let i = smoke.length - 1; i >= 0; i--) {
    const p = smoke[i]
    p.life -= delta
    if (p.life <= 0) {
      smoke.splice(i, 1)
      continue
    }
    p.x += (p.vx + Math.sin(elapsed * 2.4 + p.phase) * 7) * delta
    p.y += p.vy * delta
    p.vy -= 2 * delta
    const age = 1 - p.life / p.maxLife
    const alpha = Math.min(0.76, (p.life / p.maxLife) * 0.86)
    const puffSize = p.size + (age > 0.32 ? PIXEL : 0)
    ctx.fillStyle =
      i % 3 === 0
        ? `rgba(242, 246, 233, ${alpha})`
        : `rgba(180, 202, 193, ${alpha * 0.74})`
    pixelRect(ctx, p.x, p.y, puffSize, puffSize)
    // A second offset tile makes each particle read as a tiny drifting smoke puff.
    if (age > 0.18) {
      const offset = Math.sin(elapsed * 2 + p.phase) * PIXEL
      ctx.fillStyle = `rgba(220, 231, 217, ${alpha * 0.55})`
      pixelRect(ctx, p.x + offset + puffSize, p.y - PIXEL, PIXEL, PIXEL)
    }
  }
  ctx.restore()
}

type MouthState = {
  point: Point
  nose: Point
  openness: number
}

function getMouth(
  face: Array<{ x: number; y: number }> | undefined,
  width: number,
  height: number,
): MouthState | null {
  const upper = face?.[13]
  const lower = face?.[14]
  const left = face?.[61]
  const right = face?.[291]
  const nose = face?.[1]
  if (!upper || !lower) return null
  const mouthWidth = left && right ? Math.abs(right.x - left.x) : 0.18
  const ratio = Math.abs(lower.y - upper.y) / Math.max(mouthWidth, 0.04)
  const point = {
    x: (1 - (upper.x + lower.x) / 2) * width,
    y: ((upper.y + lower.y) / 2) * height,
  }
  return {
    point,
    nose: nose
      ? { x: (1 - nose.x) * width, y: nose.y * height }
      : { x: point.x, y: point.y - height * 0.08 },
    // Closed lips hover near 0; a real open mouth crosses ~0.25.
    openness: Math.max(0, Math.min(1, (ratio - 0.08) / 0.28)),
  }
}

function spawnBreathSmoke(
  smoke: SmokePixel[],
  mouth: Point,
  nose: Point,
  now: number,
) {
  // Two separate plumes create a readable exhale without touching the webcam image.
  spawnSmoke(smoke, mouth, -Math.PI / 2 - 0.08, now, 52)
  spawnSmoke(smoke, nose, -Math.PI / 2 + 0.14, now, 34)
}

function cigaretteEndpoints(cigarette: Cigarette): [Point, Point] {
  const burnScale = Math.max(0.6, 1 - cigarette.burn * 0.8)
  const emberX = 12 + (-36 - 12) * burnScale - 3
  const toPoint = (localX: number): Point => ({
    x: cigarette.x + Math.cos(cigarette.angle) * localX,
    y: cigarette.y + Math.sin(cigarette.angle) * localX,
  })
  return [toPoint(emberX), toPoint(36)]
}

function placeAtGrip(cigarette: Cigarette, grip: Point) {
  // The filter/base is the held end: it sits exactly between the fingertips.
  const baseOffset = 36
  cigarette.x = grip.x - Math.cos(cigarette.angle) * baseOffset
  cigarette.y = grip.y - Math.sin(cigarette.angle) * baseOffset
}

function Scene({
  video,
  paused,
}: { video: HTMLVideoElement } & ExperimentProps) {
  const { canvasRef, ctxRef, sizeRef } = useCanvas2D()
  const handLandmarkerRef = useRef<HandLandmarker | null>(null)
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null)
  const handsRef = useRef<HandState[]>([])
  const mouthRef = useRef<MouthState | null>(null)
  const pinchRef = useRef<boolean[]>([])
  const lastDetectionRef = useRef(0)
  const cigaretteRef = useRef<Cigarette | null>(null)
  const smokeRef = useRef<SmokePixel[]>([])
  const statusRef = useRef('find the cigarette')

  useEffect(() => {
    let cancelled = false
    let handLandmarker: HandLandmarker | null = null
    let faceLandmarker: FaceLandmarker | null = null

    void (async () => {
      try {
        ;[handLandmarker, faceLandmarker] = await Promise.all([
          createHandLandmarker(2, {
            minHandDetectionConfidence: 0.45,
            minTrackingConfidence: 0.4,
          }),
          createFaceLandmarker(),
        ])
        if (cancelled) {
          handLandmarker.close()
          faceLandmarker.close()
          return
        }
        handLandmarkerRef.current = handLandmarker
        faceLandmarkerRef.current = faceLandmarker
      } catch (error) {
        console.error('Failed to load pixel cigarette tracking', error)
      }
    })()

    return () => {
      cancelled = true
      handLandmarkerRef.current?.close()
      faceLandmarkerRef.current?.close()
      handLandmarkerRef.current = null
      faceLandmarkerRef.current = null
    }
  }, [])

  useAnimationLoop((elapsed, delta) => {
    const ctx = ctxRef.current
    const { width, height } = sizeRef.current
    if (!ctx || !width || !height) return

    let cigarette = cigaretteRef.current
    if (!cigarette || cigarette.x > width || cigarette.y > height) {
      cigarette = randomCigarette(width, height)
      cigaretteRef.current = cigarette
    }

    drawWebcamCover(ctx, video, width, height)

    const now = performance.now()
    const handLandmarker = handLandmarkerRef.current
    const faceLandmarker = faceLandmarkerRef.current
    if (
      handLandmarker &&
      faceLandmarker &&
      video.readyState >= 2 &&
      now - lastDetectionRef.current >= DETECT_INTERVAL_MS
    ) {
      const timestamp = Math.max(now, lastDetectionRef.current + 1)
      lastDetectionRef.current = timestamp
      const result = handLandmarker.detectForVideo(video, timestamp)
      const rawHands = result.landmarks
        .map((landmarks) => {
          const thumb = {
            x: (1 - landmarks[4].x) * width,
            y: landmarks[4].y * height,
          }
          const index = {
            x: (1 - landmarks[8].x) * width,
            y: landmarks[8].y * height,
          }
          const middle = {
            x: (1 - landmarks[12].x) * width,
            y: landmarks[12].y * height,
          }
          const wrist = {
            x: (1 - landmarks[0].x) * width,
            y: landmarks[0].y * height,
          }
          const middleBase = {
            x: (1 - landmarks[9].x) * width,
            y: landmarks[9].y * height,
          }
          const handScale = distanceBetween(wrist, middleBase)
          const thumbIndex = distanceBetween(thumb, index)
          const indexMiddle = distanceBetween(index, middle)
          const pairA = thumbIndex <= indexMiddle ? thumb : index
          const pairB = thumbIndex <= indexMiddle ? index : middle
          return {
            thumb,
            index,
            middle,
            pinchPoint: {
              x: (pairA.x + pairB.x) / 2,
              y: (pairA.y + pairB.y) / 2,
            },
            pinchAngle: Math.atan2(pairB.y - pairA.y, pairB.x - pairA.x),
            handScale,
          }
        })
        .sort((a, b) => a.pinchPoint.x - b.pinchPoint.x)

      handsRef.current = rawHands.map((hand, i) => {
        const pinching = isPinching(
          hand.thumb,
          hand.index,
          hand.middle,
          hand.handScale,
          pinchRef.current[i] ?? false,
        )
        pinchRef.current[i] = pinching
        return { ...hand, pinching }
      })
      pinchRef.current.length = rawHands.length
      mouthRef.current = getMouth(
        faceLandmarker.detectForVideo(video, timestamp).faceLandmarks[0],
        width,
        height,
      )
    }

    const hands = handsRef.current
    const mouth = mouthRef.current
    const activeHand =
      cigarette.heldBy === null ? null : hands[cigarette.heldBy]

    if (cigarette.heldBy === null) {
      const grabber = hands.findIndex(
        (hand) =>
          hand.pinching &&
          distanceBetween(hand.pinchPoint, cigarette) < GRAB_RADIUS,
      )
      if (grabber >= 0) {
        const hand = hands[grabber]
        cigarette.heldBy = grabber
        // Keep the filter toward the face, then anchor that end at the pinch point.
        cigarette.angle = hand.pinchPoint.x < width / 2 ? 0 : Math.PI
        placeAtGrip(cigarette, hand.pinchPoint)
        statusRef.current = 'drag it to your lips'
      }
    } else if (!activeHand || !activeHand.pinching) {
      if (cigarette.atMouth && cigarette.inhaled) {
        const smokeOrigin = cigarette.mouthContact ??
          mouth?.point ?? { x: cigarette.x, y: cigarette.y }
        spawnBreathSmoke(
          smokeRef.current,
          smokeOrigin,
          cigarette.noseContact ??
            mouth?.nose ?? { x: smokeOrigin.x, y: smokeOrigin.y - 32 },
          now,
        )
      }
      cigarette.heldBy = null
      cigarette.atMouth = false
      cigarette.inhaling = false
      cigarette.inhaled = false
      cigarette.inhalePower = 0
      cigarette.mouthContact = null
      cigarette.noseContact = null
      statusRef.current = 'pinch it again to pick it up'
    }

    const holder = cigarette.heldBy === null ? null : hands[cigarette.heldBy]
    if (holder) {
      placeAtGrip(cigarette, holder.pinchPoint)
      const mouthTarget = mouth?.point ?? cigarette.mouthContact
      if (mouthTarget) {
        const [endpointA, endpointB] = cigaretteEndpoints(cigarette)
        const nearMouth =
          Math.min(
            distanceBetween(endpointA, mouthTarget),
            distanceBetween(endpointB, mouthTarget),
          ) < MOUTH_RADIUS
        const inhalePower = nearMouth
          ? Math.max(0, Math.min(1, ((mouth?.openness ?? 0) - 0.22) / 0.45))
          : 0
        const inhaling = inhalePower > 0
        if (nearMouth && !cigarette.atMouth) {
          statusRef.current = 'at your lips — open your mouth to inhale'
          cigarette.mouthContact = { ...mouthTarget }
          cigarette.noseContact = mouth?.nose ? { ...mouth.nose } : null
        }
        if (inhaling) {
          cigarette.inhaled = true
          cigarette.inhalePower = inhalePower
          statusRef.current = 'inhale — hold, then pull it away to exhale'
        }
        if (!nearMouth && cigarette.atMouth) {
          // Keep the origin at the lips, even when face tracking drops for a frame.
          if (cigarette.inhaled) {
            const smokeOrigin = cigarette.mouthContact ?? mouthTarget
            spawnBreathSmoke(
              smokeRef.current,
              smokeOrigin,
              cigarette.noseContact ??
                mouth?.nose ?? { x: smokeOrigin.x, y: smokeOrigin.y - 32 },
              now,
            )
            statusRef.current = 'pixel smoke released from mouth + nose'
          }
          cigarette.mouthContact = null
          cigarette.noseContact = null
          cigarette.inhaled = false
        }
        cigarette.atMouth = nearMouth
        cigarette.inhaling = inhaling
        cigarette.inhalePower = inhalePower
      } else {
        cigarette.inhaling = false
        cigarette.inhalePower = 0
      }
    }

    if (cigarette.inhaling) {
      cigarette.burn = Math.min(
        0.5,
        cigarette.burn + delta * (0.08 + cigarette.inhalePower * 0.16),
      )
    }
    drawSmoke(ctx, smokeRef.current, elapsed, delta)
    drawCigarette(ctx, cigarette, elapsed)

    ctx.save()
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.fillStyle = 'rgba(18, 12, 14, 0.7)'
    ctx.fillRect(14, 14, Math.min(width - 28, 300), 24)
    ctx.fillStyle = '#f9e3b8'
    ctx.fillText(`PIXEL CIGARETTE  /  ${statusRef.current}`, 22, 30)
    if (cigarette.heldBy === null) {
      ctx.fillStyle = 'rgba(249, 227, 184, 0.7)'
      ctx.fillText('pinch index + thumb or index + middle', 18, height - 18)
    }
    ctx.restore()
  }, paused)

  return (
    <div className="relative size-full overflow-hidden bg-black">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 size-full touch-none"
      />
    </div>
  )
}

export default function PixelCigarette({ paused }: ExperimentProps) {
  return (
    <WebcamGate hint="pinch the floating pixel cigarette with index + thumb or index + middle finger">
      {(video) => <Scene video={video} paused={paused} />}
    </WebcamGate>
  )
}

import { useEffect, useRef, useState } from 'react'
import type { FaceLandmarker, HandLandmarker } from '@mediapipe/tasks-vision'

import { WebcamGate } from '@/shared/components/WebcamGate'
import { createFaceLandmarker, createHandLandmarker } from '@/shared/lib/mediapipe'
import type { ExperimentProps } from '@/shared/types'

import { classifyGesture } from './classifyGesture'
import type { CatGesture, Lm } from './classifyGesture'
import { MEMES } from './memes'

const HOLD_FRAMES = 4
const DETECT_INTERVAL_MS = 33

const GESTURE_HINTS: Array<{ id: CatGesture; emoji: string }> = [
  { id: 'pray', emoji: '🙏' },
  { id: 'pointUp', emoji: '☝️' },
  { id: 'shy', emoji: '👉👈' },
  { id: 'fist', emoji: '👊' },
  { id: 'shush', emoji: '🤫' },
  { id: 'shaka', emoji: '🤙' },
]

function CatGesturesStage({ video, paused }: { video: HTMLVideoElement; paused: boolean }) {
  const handLandmarkerRef = useRef<HandLandmarker | null>(null)
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null)
  const committedRef = useRef<CatGesture | null>(null)
  const pendingRef = useRef<CatGesture | null>(null)
  const streakRef = useRef(0)
  const [gesture, setGesture] = useState<CatGesture | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    let handLandmarker: HandLandmarker | null = null
    let faceLandmarker: FaceLandmarker | null = null
    const closeLandmarkers = () => {
      handLandmarker?.close()
      faceLandmarker?.close()
      handLandmarker = null
      faceLandmarker = null
    }

    void (async () => {
      try {
        handLandmarker = await createHandLandmarker(2)
        faceLandmarker = await createFaceLandmarker()
        if (cancelled) return
        handLandmarkerRef.current = handLandmarker
        faceLandmarkerRef.current = faceLandmarker
        setReady(true)
      } catch (error) {
        console.error('Failed to load cat gesture detection', error)
      } finally {
        if (cancelled) closeLandmarkers()
      }
    })()

    return () => {
      cancelled = true
      handLandmarkerRef.current = null
      faceLandmarkerRef.current = null
      closeLandmarkers()
    }
  }, [])

  useEffect(() => {
    if (!ready || paused) return

    let cancelled = false
    let raf = 0
    let lastDetection = 0

    const detect = (now: number) => {
      if (cancelled) return
      raf = requestAnimationFrame(detect)
      if (now - lastDetection < DETECT_INTERVAL_MS || video.readyState < 2) return
      lastDetection = now

      const handLandmarker = handLandmarkerRef.current
      const faceLandmarker = faceLandmarkerRef.current
      if (!handLandmarker || !faceLandmarker) return

      const hands: Lm[][] = handLandmarker.detectForVideo(video, now).landmarks
      const face = faceLandmarker.detectForVideo(video, now).faceLandmarks[0]
      const upperLip = face?.[13]
      const lowerLip = face?.[14]
      const mouth =
        upperLip && lowerLip
          ? {
              x: (upperLip.x + lowerLip.x) / 2,
              y: (upperLip.y + lowerLip.y) / 2,
              z: ((upperLip.z ?? 0) + (lowerLip.z ?? 0)) / 2,
            }
          : null
      const label = classifyGesture(hands, mouth)

      if (!label) {
        pendingRef.current = null
        streakRef.current = 0
        return
      }
      if (label === pendingRef.current) streakRef.current += 1
      else {
        pendingRef.current = label
        streakRef.current = 1
      }
      if (streakRef.current >= HOLD_FRAMES && label !== committedRef.current) {
        committedRef.current = label
        setGesture(label)
      }
    }

    raf = requestAnimationFrame(detect)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [paused, ready, video])

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <div className="grid h-full grid-rows-[1fr_auto]">
        <section className="relative min-h-0 bg-black">
          {gesture ? (
            <img
              src={MEMES[gesture]}
              alt={gesture}
              className="absolute inset-0 size-full object-cover"
            />
          ) : null}
        </section>
        <section className="relative aspect-video w-full overflow-hidden border-t border-white/15 bg-black">
          <video
            ref={(element) => {
              if (element && element.srcObject !== video.srcObject) {
                element.srcObject = video.srcObject
                void element.play().catch(() => undefined)
              }
            }}
            playsInline
            muted
            className="h-full w-full -scale-x-100 object-cover"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-2 pb-2 pt-6">
            <div
              className="flex items-center justify-center gap-1.5"
              aria-label="available gestures"
            >
              {GESTURE_HINTS.map(({ id, emoji }) => {
                const active = gesture === id
                return (
                  <span
                    key={id}
                    className={[
                      'rounded-md px-1.5 py-0.5 text-[18px] leading-none transition',
                      active
                        ? 'scale-110 bg-white/25 ring-1 ring-white/60'
                        : 'bg-black/25 opacity-80',
                    ].join(' ')}
                    aria-current={active ? 'true' : undefined}
                  >
                    {emoji}
                  </span>
                )
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default function Experiment({ paused }: ExperimentProps) {
  return (
    <WebcamGate hint="enable camera, show a gesture: 🙏 ☝️ 👉👈 👊 🤫 🤙">
      {(video) => <CatGesturesStage video={video} paused={paused} />}
    </WebcamGate>
  )
}

import { useEffect, useRef } from 'react'
import type { HandLandmarker, ImageSegmenter } from '@mediapipe/tasks-vision'
import { WebcamGate } from '@/shared/components/WebcamGate'
import { SoundToggle } from '@/shared/components/SoundToggle'
import type { ExperimentProps } from '@/shared/types'
import { useAnimationLoop } from '@/shared/hooks/useAnimationLoop'
import { useCanvas2D } from '@/shared/hooks/useCanvas2D'
import { useGlassAudio } from '@/shared/hooks/useGlassAudio'
import { GLASS_SCALE } from '@/shared/lib/glassAudio'
import { createHandLandmarker, createImageSegmenter } from '@/shared/lib/mediapipe'
import { dist, mirroredPoint, type Point } from '../_shared/asciiTools'

const SW = 192 // stored mask width
const SH = 108 // stored mask height
const RING = 96 // ~3.2s of frames at 30fps
const MASK_T = 0.5
const DETECT_MS = 33
const FOLLOW_LAG = 0.95 // seconds the shadow trails in normal mode
const PINCH_ON = 44
const PINCH_OFF = 62

interface Frame {
  t: number
  data: Uint8Array // SW*SH person confidence (0..255)
  cx: number // centroid in screen-normalised 0..1 (already mirror space)
  cy: number
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
  const segRef = useRef<ImageSegmenter | null>(null)
  const handRef = useRef<HandLandmarker | null>(null)
  const lastDetect = useRef(0)

  // ring buffer of downsampled masks
  const ring = useRef<Frame[]>(
    Array.from({ length: RING }, () => ({ t: 0, data: new Uint8Array(SW * SH), cx: 0.5, cy: 0.5 })),
  )
  const ringHead = useRef(0)
  const ringFilled = useRef(0)

  const shadowCanvas = useRef<HTMLCanvasElement | null>(null)
  const shadowImage = useRef<ImageData | null>(null)

  const lagRef = useRef(FOLLOW_LAG)
  const offsetRef = useRef<Point>({ x: 0, y: 0 })
  const wanderRef = useRef<{ until: number; next: number; phase: number }>({ until: 0, next: 2000, phase: 0 })
  const pinchRef = useRef(false)
  const pinchStateRef = useRef(false)
  const pinchPtRef = useRef<Point | null>(null)
  const syncFlashRef = useRef(0)

  const { audioRef, muted, toggleMuted } = useGlassAudio(paused, 0.4)

  useEffect(() => {
    const el = videoRef.current
    if (el) {
      el.srcObject = video.srcObject
      void el.play().catch(() => {})
    }
  }, [video])

  useEffect(() => {
    let alive = true
    void Promise.all([createImageSegmenter(), createHandLandmarker(1)]).then(([seg, hand]) => {
      if (alive) {
        segRef.current = seg
        handRef.current = hand
      } else {
        seg.close()
        hand.close()
      }
    })
    return () => {
      alive = false
      segRef.current?.close()
      handRef.current?.close()
      segRef.current = null
      handRef.current = null
    }
  }, [])

  useAnimationLoop(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    const { width, height } = sizeRef.current
    if (!width || !height) return
    const now = performance.now()
    const audio = audioRef.current

    // ── detection: hand pinch + segmentation into the ring ──────
    if (video.readyState >= 2 && video.videoWidth > 0 && now - lastDetect.current > DETECT_MS) {
      const ts = now > lastDetect.current ? now : lastDetect.current + 1
      lastDetect.current = ts

      const hand = handRef.current
      if (hand) {
        const l = hand.detectForVideo(video, ts).landmarks[0]
        if (l) {
          const thumb = mirroredPoint(l[4], width, height)
          const index = mirroredPoint(l[8], width, height)
          const d = dist(thumb, index)
          const was = pinchStateRef.current
          const on = was ? d < PINCH_OFF : d < PINCH_ON
          pinchStateRef.current = on
          pinchRef.current = on
          pinchPtRef.current = { x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 }
        } else {
          pinchStateRef.current = false
          pinchRef.current = false
          pinchPtRef.current = null
        }
      }

      const seg = segRef.current
      if (seg) {
        seg.segmentForVideo(video, ts, (result) => {
          const mask = result.confidenceMasks?.[0]
          if (!mask) return
          const src = mask.getAsFloat32Array()
          const mw = mask.width
          const mh = mask.height
          const frame = ring.current[ringHead.current]
          frame.t = now
          let sx = 0
          let sy = 0
          let count = 0
          // nearest-neighbour downsample into SW x SH
          for (let y = 0; y < SH; y++) {
            const my = Math.min(mh - 1, Math.floor((y / SH) * mh))
            for (let x = 0; x < SW; x++) {
              const mx = Math.min(mw - 1, Math.floor((x / SW) * mw))
              const v = src[my * mw + mx]
              frame.data[y * SW + x] = v > 1 ? 255 : Math.round(v * 255)
              if (v > MASK_T) {
                sx += x
                sy += y
                count++
              }
            }
          }
          // centroid in mirror-screen space (mask is video space → mirror x)
          if (count > 0) {
            frame.cx = 1 - sx / count / SW
            frame.cy = sy / count / SH
          }
          ringHead.current = (ringHead.current + 1) % RING
          ringFilled.current = Math.min(RING, ringFilled.current + 1)
        })
      }
    }

    // ── autonomous behaviour: occasionally the shadow wanders ───
    const wander = wanderRef.current
    const pinching = pinchRef.current
    const inWander = now < wander.until
    if (!pinching && !inWander && now > wander.next) {
      wander.until = now + 2200 + Math.random() * 2600
      wander.next = wander.until + 5000 + Math.random() * 7000
      wander.phase = Math.random() * Math.PI * 2
      audio?.bell(GLASS_SCALE[0], { bright: 0.3, dur: 2.6, gain: 0.3, pan: (Math.random() - 0.5) * 1.4 })
      audio?.setPadBrightness(0.12)
    }

    // target lag + offset depend on mode
    let targetLag = FOLLOW_LAG
    let targetOx = Math.sin(now * 0.0006) * width * 0.008
    let targetOy = Math.cos(now * 0.0005) * height * 0.006
    if (pinching) {
      targetLag = 0.06
      targetOx = 0
      targetOy = 0
    } else if (inWander) {
      const k = now * 0.0011
      targetLag = 1.7
      targetOx = Math.sin(k + wander.phase) * width * 0.16
      targetOy = Math.sin(k * 1.3 + wander.phase * 2) * height * 0.1
    }
    lagRef.current = lerp(lagRef.current, targetLag, pinching ? 0.25 : 0.05)
    offsetRef.current.x = lerp(offsetRef.current.x, targetOx, pinching ? 0.3 : 0.05)
    offsetRef.current.y = lerp(offsetRef.current.y, targetOy, pinching ? 0.3 : 0.05)

    // detect the sync snap (pinch just closed)
    if (pinching && lagRef.current > 0.5 && syncFlashRef.current < now - 400) {
      syncFlashRef.current = now
      audio?.chord(GLASS_SCALE[2], { bright: 0.6, dur: 2.2, gain: 0.34 })
    }
    audio?.setPadBrightness(clamp(pinching ? 0.7 : inWander ? 0.12 : 0.32, 0, 1))

    // ── pick the delayed frame ──────────────────────────────────
    const targetTime = now - lagRef.current * 1000
    let best: Frame | null = null
    let bestDiff = Infinity
    const filled = ringFilled.current
    for (let i = 0; i < filled; i++) {
      const fr = ring.current[i]
      if (fr.t === 0) continue
      const diff = Math.abs(fr.t - targetTime)
      if (diff < bestDiff) {
        bestDiff = diff
        best = fr
      }
    }

    // ════════ RENDER ════════════════════════════════════════════
    ctx.save()
    ctx.translate(width, 0)
    ctx.scale(-1, 1)
    if (video.readyState >= 2 && video.videoWidth > 0) ctx.drawImage(video, 0, 0, width, height)
    else {
      ctx.fillStyle = '#07080c'
      ctx.fillRect(0, 0, width, height)
    }
    ctx.restore()
    // desaturate/darken the room so the shadow reads
    ctx.fillStyle = 'rgba(10,10,16,0.4)'
    ctx.fillRect(0, 0, width, height)

    if (best) {
      // build the tinted shadow bitmap
      let sc = shadowCanvas.current
      if (!sc) {
        sc = shadowCanvas.current = document.createElement('canvas')
        sc.width = SW
        sc.height = SH
        shadowImage.current = sc.getContext('2d')!.createImageData(SW, SH)
      }
      const img = shadowImage.current!
      const px = img.data
      const possessed = inWander || pinching
      // wandering shadow gets an uncanny violet edge, synced one is inky black
      const rTint = possessed ? 40 : 6
      const gTint = possessed ? 6 : 6
      const bTint = possessed ? 56 : 12
      const d = best.data
      for (let i = 0; i < d.length; i++) {
        const a = d[i]
        const j = i * 4
        px[j] = rTint
        px[j + 1] = gTint
        px[j + 2] = bTint
        px[j + 3] = a > 128 ? Math.round(a * 0.82) : 0
      }
      const sctx = sc.getContext('2d')!
      sctx.putImageData(img, 0, 0)

      const ox = offsetRef.current.x
      const oy = offsetRef.current.y

      ctx.save()
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      // soft glow rim (drawn larger, screen-blended) for the possessed twin
      if (possessed) {
        ctx.globalCompositeOperation = 'screen'
        ctx.globalAlpha = 0.5
        const grow = 10
        ctx.translate(width, 0)
        ctx.scale(-1, 1)
        ctx.drawImage(sc, -ox - grow, oy - grow, width + grow * 2, height + grow * 2)
        ctx.restore()
        ctx.save()
        ctx.imageSmoothingEnabled = true
      }
      // main shadow body
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
      ctx.translate(width, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(sc, -ox, oy, width, height)
      ctx.restore()

      // sync flash halo
      const flash = clamp(1 - (now - syncFlashRef.current) / 500, 0, 1)
      if (flash > 0) {
        ctx.save()
        ctx.globalAlpha = flash * 0.4
        ctx.fillStyle = '#bfe6ff'
        ctx.fillRect(0, 0, width, height)
        ctx.restore()
      }
    }

    // pinch cursor
    const pt = pinchPtRef.current
    if (pt) {
      ctx.strokeStyle = pinching ? 'rgba(191,230,255,0.95)' : 'rgba(150,170,210,0.6)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, pinching ? 9 : 15, 0, Math.PI * 2)
      ctx.stroke()
    }

    // HUD
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(200,210,235,0.6)'
    ctx.fillText(
      inWander ? 'your shadow slipped loose — pinch to pull it back' : 'pinch thumb + index to sync your shadow',
      16,
      height - 16,
    )
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

export default function ShadowTwin({ paused }: ExperimentProps) {
  return (
    <WebcamGate hint="stand back so your whole silhouette is in frame — your shadow will trail behind you">
      {(video) => <Scene video={video} paused={paused} />}
    </WebcamGate>
  )
}

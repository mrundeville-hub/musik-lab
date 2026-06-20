import { useEffect, useRef } from 'react'
import type { HandLandmarker } from '@mediapipe/tasks-vision'
import { WebcamGate } from '@/shared/components/WebcamGate'
import { SoundToggle } from '@/shared/components/SoundToggle'
import type { ExperimentProps } from '@/shared/types'
import { useCanvas2D } from '@/shared/hooks/useCanvas2D'
import { useAnimationLoop } from '@/shared/hooks/useAnimationLoop'
import { createHandLandmarker } from '@/shared/lib/mediapipe'
import { GLASS_SCALE } from '@/shared/lib/glassAudio'
import { useGlassAudio } from '@/shared/hooks/useGlassAudio'
import { drawDimWebcam, dist, mirroredPoint, type Point } from '../_shared/asciiTools'

const FINGERTIPS = [4, 8, 12, 16, 20]
const LINK_DIST = 150
const STAR_GLYPHS = ['✦', '✧', '✶', '+', '·']

function Scene({ video, paused }: { video: HTMLVideoElement } & ExperimentProps) {
  const { canvasRef, ctxRef, sizeRef } = useCanvas2D()
  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const starsRef = useRef<Point[]>([])
  const edgesRef = useRef(new Set<string>())
  const lastDetect = useRef(0)
  const { audioRef, muted, toggleMuted } = useGlassAudio(paused)

  useEffect(() => {
    let alive = true
    void createHandLandmarker(2).then((lm) => {
      if (alive) landmarkerRef.current = lm
      else lm.close()
    })
    return () => {
      alive = false
      landmarkerRef.current?.close()
    }
  }, [])

  useAnimationLoop(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    const { width, height } = sizeRef.current
    if (!width || !height) return
    const now = performance.now()
    const audio = audioRef.current

    // detection ~30fps with strictly-increasing timestamps
    const lm = landmarkerRef.current
    if (lm && video.readyState >= 2 && video.videoWidth > 0 && now - lastDetect.current > 33) {
      const ts = now > lastDetect.current ? now : lastDetect.current + 1
      lastDetect.current = ts
      const res = lm.detectForVideo(video, ts)
      starsRef.current = res.landmarks.flatMap((hand) =>
        FINGERTIPS.map((i) => mirroredPoint(hand[i], width, height)),
      )
    }

    // ── full-brightness webcam (opaque → clears the prior frame) ──
    if (video.readyState >= 2 && video.videoWidth > 0) {
      drawDimWebcam(ctx, video, width, height, 1)
      // a whisper of deep-space tint, very subtle, keeps stars readable
      ctx.fillStyle = 'rgba(10,14,30,0.18)'
      ctx.fillRect(0, 0, width, height)
    } else {
      ctx.fillStyle = '#05070f'
      ctx.fillRect(0, 0, width, height)
    }

    const stars = starsRef.current
    const nextEdges = new Set<string>()
    const degree = new Array(stars.length).fill(0)

    // ── links ──
    ctx.save()
    ctx.lineCap = 'round'
    for (let i = 0; i < stars.length; i++) {
      for (let j = i + 1; j < stars.length; j++) {
        const d = dist(stars[i], stars[j])
        if (d >= LINK_DIST) continue
        const key = `${i}:${j}`
        nextEdges.add(key)
        degree[i]++
        degree[j]++
        const strength = 1 - d / LINK_DIST
        const a = stars[i]
        const b = stars[j]
        const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y)
        grad.addColorStop(0, `rgba(178,220,255,${0.25 + strength * 0.6})`)
        grad.addColorStop(0.5, `rgba(120,255,235,${0.2 + strength * 0.55})`)
        grad.addColorStop(1, `rgba(190,170,255,${0.25 + strength * 0.6})`)
        ctx.strokeStyle = grad
        ctx.lineWidth = 0.6 + strength * 2.2
        ctx.shadowColor = 'rgba(140,220,255,0.7)'
        ctx.shadowBlur = 8 * strength
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()

        // a travelling spark riding the link
        const t = (now * 0.0006 + i * 0.13) % 1
        ctx.shadowBlur = 0
        ctx.fillStyle = `rgba(220,255,250,${0.5 * strength})`
        ctx.beginPath()
        ctx.arc(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 1.6, 0, Math.PI * 2)
        ctx.fill()

        // ── strange glass synth on a NEW connection ──
        if (!edgesRef.current.has(key)) {
          const idx = Math.min(5, Math.floor(strength * 5))
          const pan = (a.x / width) * 2 - 1
          audio?.bell(GLASS_SCALE[idx] * (Math.random() < 0.3 ? 2 : 1), {
            bright: 0.85 + Math.random() * 0.15,
            dur: 1.6 + strength * 1.5,
            gain: 0.3 + strength * 0.25,
            pan,
          })
          if (Math.random() < 0.5) audio?.sparkle(pan)
        }
      }
    }
    ctx.restore()

    // a constellation forms (a star reaching degree 3) → lush chord
    for (let i = 0; i < stars.length; i++) {
      if (degree[i] >= 3) {
        const everyKey = `tri:${i}:${degree[i]}`
        if (!edgesRef.current.has(everyKey)) {
          audio?.chord(GLASS_SCALE[1], { bright: 0.7, dur: 3.4, gain: 0.32, pan: (stars[i].x / width) * 2 - 1 })
        }
        nextEdges.add(everyKey)
      }
    }

    // a faint shimmer when a link breaks
    for (const key of edgesRef.current) {
      if (!key.startsWith('tri:') && !nextEdges.has(key)) audio?.sparkle()
    }
    edgesRef.current = nextEdges

    // ── stars ──
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i]
      const twinkle = 0.6 + 0.4 * Math.sin(now * 0.004 + i * 1.7)
      const lit = degree[i] > 0
      const size = (lit ? 22 : 16) + twinkle * 4
      ctx.font = `${Math.round(size)}px ui-monospace, monospace`
      ctx.shadowColor = lit ? 'rgba(140,255,235,0.9)' : 'rgba(184,247,255,0.7)'
      ctx.shadowBlur = (lit ? 16 : 8) * twinkle
      ctx.fillStyle = lit ? '#d8fff4' : '#b8f7ff'
      ctx.fillText(STAR_GLYPHS[i % STAR_GLYPHS.length], s.x, s.y)
    }
    ctx.shadowBlur = 0

    // label
    ctx.font = '11px ui-monospace, monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(216,255,244,0.7)'
    ctx.fillText('fingertips are stars · bring them close to forge constellations', 18, height - 20)
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

export default function Constellation({ paused }: ExperimentProps) {
  return (
    <WebcamGate hint="camera turns fingertips into stars — connect them to make sounds">
      {(video) => <Scene video={video} paused={paused} />}
    </WebcamGate>
  )
}

import { useEffect, useRef, useState } from 'react'
import type { HandLandmarker } from '@mediapipe/tasks-vision'
import { WebcamGate } from '@/shared/components/WebcamGate'
import { SoundToggle } from '@/shared/components/SoundToggle'
import type { ExperimentProps } from '@/shared/types'
import { createHandLandmarker } from '@/shared/lib/mediapipe'
import {
  clearInk,
  dist,
  drawDimWebcam,
  drawLabel,
  mirroredPoint,
  resizeCanvas,
  TinyAudio,
  type Point,
} from '../../_shared/asciiTools'

interface Fish extends Point {
  vx: number
  vy: number
  glyph: string
  toneAt: number
}

const FISH = ['><>', '<><', '>-<', '<*}}}><', '><((*>']
const TIPS = [4, 8, 12, 16, 20]

function Scene({ video, paused }: { video: HTMLVideoElement } & ExperimentProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const fishRef = useRef<Fish[]>([])
  const handRef = useRef<{ point: Point; attract: boolean } | null>(null)
  const audioRef = useRef(new TinyAudio())
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    let alive = true
    const audio = audioRef.current
    void createHandLandmarker(2).then((landmarker) => {
      if (alive) landmarkerRef.current = landmarker
      else landmarker.close()
    })
    return () => {
      alive = false
      landmarkerRef.current?.close()
      audio.dispose()
    }
  }, [])

  useEffect(() => audioRef.current.setMuted(muted || paused), [muted, paused])

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return
      const { width, height } = resizeCanvas(canvas)
      const dt = Math.min((now - last) / 1000, 0.04)
      last = now

      if (!fishRef.current.length) {
        fishRef.current = Array.from({ length: 72 }, () => ({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 70,
          vy: (Math.random() - 0.5) * 40,
          glyph: FISH[Math.floor(Math.random() * FISH.length)],
          toneAt: 0,
        }))
      }

      if (!paused && landmarkerRef.current && video.readyState >= 2) {
        const res = landmarkerRef.current.detectForVideo(video, now)
        const hand = res.landmarks[0]
        if (hand) {
          const wrist = mirroredPoint(hand[0], width, height)
          const tips = TIPS.map((i) => mirroredPoint(hand[i], width, height))
          const spread = tips.reduce((sum, p) => sum + dist(p, wrist), 0) / TIPS.length
          const center = tips.reduce((p, t) => ({ x: p.x + t.x / TIPS.length, y: p.y + t.y / TIPS.length }), {
            x: 0,
            y: 0,
          })
          handRef.current = { point: center, attract: spread < 92 }
        } else {
          handRef.current = null
        }
      }

      clearInk(ctx, width, height)
      drawDimWebcam(ctx, video, width, height, 0.08)
      ctx.font = '13px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx.textBaseline = 'middle'

      const hand = handRef.current
      for (const fish of fishRef.current) {
        let ax = 0
        let ay = 0
        if (hand) {
          const dx = hand.point.x - fish.x
          const dy = hand.point.y - fish.y
          const d = Math.max(28, Math.hypot(dx, dy))
          const force = hand.attract ? 90 / d : -360 / (d * d)
          ax += dx * force
          ay += dy * force
          if (d < 72 && now > fish.toneAt) {
            fish.toneAt = now + 450 + Math.random() * 500
            audioRef.current.tone(520 + Math.random() * 480, 0.025, 0.08, 'triangle', fish.x / width * 2 - 1)
          }
        }
        ax += (Math.random() - 0.5) * 12
        ay += (Math.random() - 0.5) * 8
        fish.vx = Math.max(-135, Math.min(135, fish.vx + ax * dt))
        fish.vy = Math.max(-90, Math.min(90, fish.vy + ay * dt))
        fish.x = (fish.x + fish.vx * dt + width) % width
        fish.y = (fish.y + fish.vy * dt + height) % height
        ctx.fillStyle = hand?.attract ? '#89f7d6' : '#9cc9ff'
        ctx.fillText(fish.vx >= 0 ? fish.glyph : fish.glyph.split('').reverse().join(''), fish.x, fish.y)
      }

      if (hand) {
        ctx.fillStyle = hand.attract ? '#e8ff9c' : '#ff8fb3'
        ctx.fillText(hand.attract ? ' корм ' : ' ладонь ', hand.point.x - 26, hand.point.y - 24)
      }
      drawLabel(ctx, 'open palm scatters | cupped fingers feed', 18, height - 22)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [paused, video])

  return (
    <div className="relative h-full min-h-[520px] overflow-hidden rounded border border-lab-line bg-black">
      <canvas ref={canvasRef} className="h-full w-full" onPointerDown={() => audioRef.current.resume()} />
      <div className="absolute right-3 top-3">
        <SoundToggle muted={muted} onToggle={() => setMuted((v) => !v)} />
      </div>
    </div>
  )
}

export default function AsciiAquarium({ paused }: ExperimentProps) {
  return <WebcamGate hint="camera feeds the aquarium">{(video) => <Scene video={video} paused={paused} />}</WebcamGate>
}

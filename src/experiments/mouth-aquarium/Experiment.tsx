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
import { drawDimWebcam } from '../_shared/asciiTools'

const MAX_FISH = 48
const DETECT_MS = 40
const FISH_GLYPHS = ['><>', '><))>', '˚∆˚', '~<°)))><', '<>']

interface Fish {
  x: number
  y: number
  vx: number
  vy: number
  glyph: string
  life: number
  phase: number
  hue: number
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}

function Scene({ video, paused }: { video: HTMLVideoElement } & ExperimentProps) {
  const { canvasRef, ctxRef, sizeRef } = useCanvas2D()
  const faceRef = useRef<FaceLandmarker | null>(null)
  const lastDetect = useRef(0)
  const mouthRef = useRef<{ x: number; y: number; open: number; w: number; h: number } | null>(null)
  const fishRef = useRef<Fish[]>([])
  const lastSpawn = useRef(0)
  const { audioRef, muted, toggleMuted } = useGlassAudio(paused, 0.35)

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
      const face = faceRef.current?.detectForVideo(video, ts).faceLandmarks[0]
      if (face) {
        const up = face[13]
        const low = face[14]
        const l = face[61]
        const r = face[291]
        const mouthW = Math.hypot((r.x - l.x) * width, (r.y - l.y) * height) || 1
        const mouthH = Math.hypot((low.x - up.x) * width, (low.y - up.y) * height)
        mouthRef.current = {
          x: (1 - (l.x + r.x) / 2) * width,
          y: ((up.y + low.y) / 2) * height,
          w: mouthW,
          h: mouthH,
          open: clamp((mouthH / mouthW - 0.18) / 0.42, 0, 1),
        }
      } else {
        mouthRef.current = null
      }
    }

    const mouth = mouthRef.current
    drawDimWebcam(ctx, video, width, height, 0.7)
    ctx.fillStyle = 'rgba(4, 18, 28, 0.28)'
    ctx.fillRect(0, 0, width, height)

    // spawn when mouth is open
    if (mouth && mouth.open > 0.22 && fishRef.current.length < MAX_FISH && now - lastSpawn.current > 90) {
      lastSpawn.current = now
      const n = Math.floor(1 + mouth.open * 2)
      for (let i = 0; i < n; i++) {
        if (fishRef.current.length >= MAX_FISH) break
        const dir = Math.random() > 0.5 ? 1 : -1
        fishRef.current.push({
          x: mouth.x + (Math.random() - 0.5) * mouth.w * 0.4,
          y: mouth.y + (Math.random() - 0.5) * Math.max(4, mouth.h),
          vx: dir * (40 + Math.random() * 80 + mouth.open * 60),
          vy: (Math.random() - 0.5) * 50,
          glyph: FISH_GLYPHS[Math.floor(Math.random() * FISH_GLYPHS.length)],
          life: 1,
          phase: Math.random() * Math.PI * 2,
          hue: 170 + Math.random() * 80,
        })
      }
      if (Math.random() < 0.35) {
        audio?.sparkle(clamp((mouth.x / width) * 2 - 1, -1, 1))
      }
    }

    if (mouth && mouth.open > 0.35 && Math.random() < 0.02) {
      audio?.bell(GLASS_SCALE[Math.floor(Math.random() * 3) + 2], {
        bright: 0.4,
        dur: 1.2,
        gain: 0.12,
        pan: clamp((mouth.x / width) * 2 - 1, -1, 1),
      })
    }
    audio?.setPadBrightness(mouth ? 0.2 + mouth.open * 0.5 : 0.1)

    const fish = fishRef.current
    ctx.font = '14px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const f of fish) {
      f.phase += delta * 6
      f.vy += Math.sin(f.phase) * 18 * delta
      f.vx *= 0.995
      f.x += f.vx * delta
      f.y += f.vy * delta
      f.life -= delta * 0.12

      // sealed lips bounce fish back
      if (mouth && mouth.open < 0.12) {
        const dx = f.x - mouth.x
        const dy = f.y - mouth.y
        const d = Math.hypot(dx, dy)
        if (d < mouth.w * 0.7) {
          f.vx = (dx / (d || 1)) * Math.abs(f.vx) * 1.4 + (Math.random() - 0.5) * 30
          f.vy = (dy / (d || 1)) * 40
          f.x = mouth.x + (dx / (d || 1)) * mouth.w * 0.75
        }
      }

      const a = clamp(f.life, 0, 1)
      const facing = f.vx < 0
      ctx.save()
      ctx.globalAlpha = a
      ctx.fillStyle = `hsla(${f.hue}, 70%, 72%, 1)`
      ctx.shadowColor = `hsla(${f.hue}, 90%, 60%, 0.8)`
      ctx.shadowBlur = 6
      if (facing) {
        ctx.translate(f.x, f.y)
        ctx.scale(-1, 1)
        ctx.fillText(f.glyph, 0, 0)
      } else {
        ctx.fillText(f.glyph, f.x, f.y)
      }
      ctx.restore()
    }
    fishRef.current = fish.filter((f) => f.life > 0 && f.x > -40 && f.x < width + 40 && f.y > -40 && f.y < height + 40)

    if (mouth && mouth.open > 0.15) {
      ctx.strokeStyle = `rgba(140,220,255,${0.2 + mouth.open * 0.45})`
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.ellipse(mouth.x, mouth.y, mouth.w * 0.55, Math.max(6, mouth.h * 0.9), 0, 0, Math.PI * 2)
      ctx.stroke()
    }

    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(180,230,255,0.55)'
    ctx.fillText(mouth ? 'open your mouth to release the school · close to trap them at the lips' : 'face the camera', 16, height - 16)
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

export default function MouthAquarium({ paused }: ExperimentProps) {
  return (
    <WebcamGate hint="open your mouth — ASCII fish will swim out into the air">
      {(video) => <Scene video={video} paused={paused} />}
    </WebcamGate>
  )
}

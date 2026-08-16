import { useEffect, useRef, useState } from 'react'
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

const DETECT_MS = 40
const MAX_GLYPHS = 180
const TYPE_MS = 280

interface Glyph {
  x: number
  y: number
  char: string
  born: number
}

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
  const gazeRef = useRef<{ x: number; y: number; blink: number } | null>(null)
  const smoothGaze = useRef({ x: 0, y: 0 })
  const glyphsRef = useRef<Glyph[]>([])
  const charIdx = useRef(0)
  const lastType = useRef(0)
  const blinkStart = useRef(0)
  const wasBlink = useRef(false)
  const [word, setWord] = useState('LOOK')
  const wordRef = useRef(word)
  const { audioRef, muted, toggleMuted } = useGlassAudio(paused, 0.35)

  useEffect(() => {
    wordRef.current = word
  }, [word])

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
        const left = face[468] ?? face[33]
        const right = face[473] ?? face[263]
        const nose = face[1]
        const lUpper = face[159]
        const lLower = face[145]
        const rUpper = face[386]
        const rLower = face[374]
        const eyeSpan = Math.hypot((right.x - left.x) * width, (right.y - left.y) * height) || 1
        const lOpen = Math.hypot((lUpper.x - lLower.x) * width, (lUpper.y - lLower.y) * height)
        const rOpen = Math.hypot((rUpper.x - rLower.x) * width, (rUpper.y - rLower.y) * height)
        const blink = 1 - clamp(((lOpen + rOpen) / 2) / (eyeSpan * 0.12), 0, 1)
        // gaze proxy: iris midpoint nudged by nose offset from eye line
        const midX = (1 - (left.x + right.x) / 2) * width
        const midY = ((left.y + right.y) / 2) * height
        const noseX = (1 - nose.x) * width
        const noseY = nose.y * height
        const gx = midX + (midX - noseX) * 1.8
        const gy = midY + (midY - noseY) * 0.6
        gazeRef.current = {
          x: clamp(gx, 40, width - 40),
          y: clamp(gy, 40, height - 80),
          blink,
        }
      } else {
        gazeRef.current = null
      }
    }

    drawDimWebcam(ctx, video, width, height, 0.35)
    ctx.fillStyle = 'rgba(10, 10, 14, 0.55)'
    ctx.fillRect(0, 0, width, height)

    const gaze = gazeRef.current
    if (gaze) {
      smoothGaze.current.x = lerp(smoothGaze.current.x || gaze.x, gaze.x, 0.2)
      smoothGaze.current.y = lerp(smoothGaze.current.y || gaze.y, gaze.y, 0.2)

      const blinking = gaze.blink > 0.55
      if (blinking && !wasBlink.current) blinkStart.current = now
      if (!blinking && wasBlink.current) {
        const held = now - blinkStart.current
        if (held > 450) {
          // new line — drop y
          smoothGaze.current.y = clamp(smoothGaze.current.y + 28, 40, height - 80)
          audio?.bell(GLASS_SCALE[0], { bright: 0.3, dur: 0.5, gain: 0.15 })
        } else {
          // space — nudge x
          smoothGaze.current.x = clamp(smoothGaze.current.x + 18, 40, width - 40)
          audio?.sparkle(0)
        }
      }
      wasBlink.current = blinking

      // type next letter while eyes open
      const text = (wordRef.current || 'LOOK').replace(/\s+/g, '')
      if (!blinking && text && glyphsRef.current.length < MAX_GLYPHS && now - lastType.current > TYPE_MS) {
        lastType.current = now
        const ch = text[charIdx.current++ % text.length]
        glyphsRef.current.push({
          x: smoothGaze.current.x,
          y: smoothGaze.current.y,
          char: ch,
          born: now,
        })
        // advance carriage
        smoothGaze.current.x = clamp(smoothGaze.current.x + 16, 40, width - 40)
        if (smoothGaze.current.x > width - 60) {
          smoothGaze.current.x = 50
          smoothGaze.current.y = clamp(smoothGaze.current.y + 26, 40, height - 80)
        }
        audio?.bell(GLASS_SCALE[ch.charCodeAt(0) % GLASS_SCALE.length], {
          bright: 0.45,
          dur: 0.35,
          gain: 0.12,
          pan: clamp((smoothGaze.current.x / width) * 2 - 1, -1, 1),
        })
      }

      // caret
      ctx.strokeStyle = 'rgba(255,240,200,0.85)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(smoothGaze.current.x, smoothGaze.current.y - 10)
      ctx.lineTo(smoothGaze.current.x, smoothGaze.current.y + 10)
      ctx.stroke()
    }

    ctx.font = '22px "Courier New", ui-monospace, monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    for (const g of glyphsRef.current) {
      const age = (now - g.born) / 1000
      const flash = clamp(1 - age * 3, 0, 1)
      ctx.fillStyle = `rgba(255, 248, 230, ${0.75 + flash * 0.25})`
      ctx.shadowColor = 'rgba(255,220,160,0.8)'
      ctx.shadowBlur = 4 + flash * 10
      ctx.fillText(g.char, g.x, g.y)
    }
    ctx.shadowBlur = 0

    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.fillStyle = 'rgba(255,240,210,0.5)'
    ctx.fillText('look to type · blink = space · longer blink = new line', 16, height - 16)
  }, paused)

  return (
    <div className="relative size-full overflow-hidden bg-black" onPointerDown={() => audioRef.current?.resume()}>
      <canvas ref={canvasRef} className="absolute inset-0 size-full touch-none" />
      <div className="absolute left-3 top-3 flex items-center gap-2">
        <label className="text-[10px] uppercase tracking-widest text-white/50">word</label>
        <input
          value={word}
          onChange={(e) => setWord(e.target.value.toUpperCase().slice(0, 24))}
          className="w-36 rounded border border-white/20 bg-black/60 px-2 py-1 font-mono text-sm text-white/90 outline-none focus:border-white/50"
        />
        <button
          type="button"
          onClick={() => {
            glyphsRef.current = []
            charIdx.current = 0
          }}
          className="rounded border border-white/20 bg-black/60 px-2 py-1 text-[10px] uppercase tracking-widest text-white/60 hover:border-white/50"
        >
          clear
        </button>
      </div>
      <div className="absolute right-3 top-3">
        <SoundToggle muted={muted} onToggle={toggleMuted} />
      </div>
    </div>
  )
}

export default function TypewriterGaze({ paused }: ExperimentProps) {
  return (
    <WebcamGate hint="your gaze types — look around and blink to write">
      {(video) => <Scene video={video} paused={paused} />}
    </WebcamGate>
  )
}

import { useEffect, useRef } from 'react'
import type { HandLandmarker } from '@mediapipe/tasks-vision'
import { WebcamGate } from '@/shared/components/WebcamGate'
import { SoundToggle } from '@/shared/components/SoundToggle'
import type { ExperimentProps } from '@/shared/types'
import { useAnimationLoop } from '@/shared/hooks/useAnimationLoop'
import { useCanvas2D } from '@/shared/hooks/useCanvas2D'
import { useGlassAudio } from '@/shared/hooks/useGlassAudio'
import { GLASS_SCALE } from '@/shared/lib/glassAudio'
import { createHandLandmarker } from '@/shared/lib/mediapipe'
import { dist, drawDimWebcam, mirroredPoint, type Point } from '../_shared/asciiTools'

const DETECT_MS = 33
const STATIONS = [
  { name: 'GLASS FM', root: 0, bright: 0.4 },
  { name: 'NIGHT WAVE', root: 1, bright: 0.55 },
  { name: 'PENTATONIC', root: 2, bright: 0.7 },
  { name: 'STATIC 88', root: 3, bright: 0.25 },
  { name: 'AURORA AM', root: 4, bright: 0.8 },
  { name: 'SOFT DRONE', root: 5, bright: 0.35 },
]

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}
function wrapPi(a: number) {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

function Scene({ video, paused }: { video: HTMLVideoElement } & ExperimentProps) {
  const { canvasRef, ctxRef, sizeRef } = useCanvas2D()
  const handRef = useRef<HandLandmarker | null>(null)
  const lastDetect = useRef(0)
  const handState = useRef<{ palm: Point; angle: number; open: number } | null>(null)
  const dialAngle = useRef(0)
  const stationIdx = useRef(0)
  const powered = useRef(false)
  const lastTick = useRef(0)
  const lastBed = useRef(0)
  const { audioRef, muted, toggleMuted } = useGlassAudio(paused, 0.2)

  useEffect(() => {
    let alive = true
    void createHandLandmarker(1).then((lm) => {
      if (alive) handRef.current = lm
      else lm.close()
    })
    return () => {
      alive = false
      handRef.current?.close()
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

    if (video.readyState >= 2 && video.videoWidth > 0 && now - lastDetect.current > DETECT_MS) {
      const ts = now > lastDetect.current ? now : lastDetect.current + 1
      lastDetect.current = ts
      const lm = handRef.current
      if (lm) {
        const l = lm.detectForVideo(video, ts).landmarks[0]
        if (l) {
          const palm = mirroredPoint(l[0], width, height)
          const index = mirroredPoint(l[8], width, height)
          const mid = mirroredPoint(l[9], width, height)
          const pinky = mirroredPoint(l[20], width, height)
          const angle = Math.atan2(index.y - palm.y, index.x - palm.x)
          const handLen = dist(palm, mid) || 1
          const open = clamp(dist(index, pinky) / (handLen * 2.4), 0, 1)
          handState.current = { palm, angle, open }
        } else {
          handState.current = null
        }
      }
    }

    drawDimWebcam(ctx, video, width, height, 0.4)
    ctx.fillStyle = 'rgba(6, 8, 12, 0.6)'
    ctx.fillRect(0, 0, width, height)

    const hand = handState.current
    if (hand) {
      const wasOn = powered.current
      powered.current = hand.open > 0.28
      if (powered.current && !wasOn) {
        audio?.bell(GLASS_SCALE[3], { bright: 0.5, dur: 0.4, gain: 0.2 })
      }
      if (!powered.current && wasOn) {
        audio?.bell(GLASS_SCALE[0], { bright: 0.2, dur: 0.5, gain: 0.15 })
        audio?.setPadBrightness(0.05)
      }

      if (powered.current) {
        const dA = wrapPi(hand.angle - dialAngle.current)
        dialAngle.current = lerp(dialAngle.current, dialAngle.current + dA, 0.35)
        // map angle to station
        const norm = (dialAngle.current / (Math.PI * 2) + 10) % 1
        const idx = Math.floor(norm * STATIONS.length) % STATIONS.length
        if (idx !== stationIdx.current) {
          stationIdx.current = idx
          lastTick.current = now
          const st = STATIONS[idx]
          audio?.bell(GLASS_SCALE[st.root], { bright: st.bright, dur: 0.3, gain: 0.18 })
          audio?.setPadBrightness(st.bright)
        }
        // soft station bed
        if (now - lastBed.current > 1400) {
          lastBed.current = now
          const st = STATIONS[stationIdx.current]
          audio?.bell(GLASS_SCALE[st.root], { bright: st.bright * 0.6, dur: 2.2, gain: 0.1 })
        }
      }
    }

    // dial UI
    const cx = width / 2
    const cy = height / 2
    const R = Math.min(width, height) * 0.28
    ctx.save()
    ctx.translate(cx, cy)
    ctx.strokeStyle = powered.current ? 'rgba(255,220,160,0.7)' : 'rgba(140,140,150,0.4)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(0, 0, R, 0, Math.PI * 2)
    ctx.stroke()
    // ticks
    for (let i = 0; i < STATIONS.length; i++) {
      const a = (i / STATIONS.length) * Math.PI * 2 - Math.PI / 2
      ctx.beginPath()
      ctx.moveTo(Math.cos(a) * (R - 8), Math.sin(a) * (R - 8))
      ctx.lineTo(Math.cos(a) * (R + 4), Math.sin(a) * (R + 4))
      ctx.stroke()
    }
    // needle
    ctx.rotate(dialAngle.current)
    ctx.strokeStyle = powered.current ? '#ffd78a' : '#888'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, -R + 16)
    ctx.stroke()
    ctx.restore()

    if (hand) {
      ctx.fillStyle = powered.current ? '#ffe6b0' : '#999'
      ctx.beginPath()
      ctx.arc(hand.palm.x, hand.palm.y, 6, 0, Math.PI * 2)
      ctx.fill()
    }

    const st = STATIONS[stationIdx.current]
    ctx.font = '18px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = powered.current ? 'rgba(255,230,180,0.9)' : 'rgba(160,160,170,0.5)'
    ctx.fillText(powered.current ? st.name : 'POWER OFF', cx, cy + R + 36)
    // signal strength bars
    if (powered.current) {
      const flash = clamp(1 - (now - lastTick.current) / 400, 0, 1)
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = `rgba(255,210,140,${0.3 + flash * 0.5 + i * 0.05})`
        ctx.fillRect(cx - 40 + i * 18, cy + R + 48 - i * 4, 12, 8 + i * 4)
      }
    }

    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(255,230,190,0.5)'
    ctx.fillText('open palm + rotate to tune · fist to power off', 16, height - 16)
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

export default function RadioDial({ paused }: ExperimentProps) {
  return (
    <WebcamGate hint="open your palm and rotate it like a radio dial to tune stations">
      {(video) => <Scene video={video} paused={paused} />}
    </WebcamGate>
  )
}

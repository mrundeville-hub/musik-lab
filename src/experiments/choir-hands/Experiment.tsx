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

const TIPS = [4, 8, 12, 16, 20] as const // thumb..pinky
const DETECT_MS = 33
const VOICE_COUNT = 10 // 5 per hand × 2

interface Voice {
  osc: OscillatorNode
  gain: GainNode
  pan: StereoPannerNode
  active: boolean
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}

function Scene({ video, paused }: { video: HTMLVideoElement } & ExperimentProps) {
  const { canvasRef, ctxRef, sizeRef } = useCanvas2D()
  const handRef = useRef<HandLandmarker | null>(null)
  const lastDetect = useRef(0)
  const tipsRef = useRef<{ tips: Point[]; palm: Point; open: number }[]>([])
  const voicesRef = useRef<Voice[]>([])
  const ctxAudioRef = useRef<AudioContext | null>(null)
  const masterRef = useRef<GainNode | null>(null)
  const { audioRef, muted, toggleMuted } = useGlassAudio(paused, 0.25)

  useEffect(() => {
    let alive = true
    void createHandLandmarker(2).then((lm) => {
      if (alive) handRef.current = lm
      else lm.close()
    })
    // sustained choir voices (sine cluster) — separate from glass bells
    const actx = new AudioContext()
    const master = actx.createGain()
    master.gain.value = 0.18
    master.connect(actx.destination)
    ctxAudioRef.current = actx
    masterRef.current = master
    voicesRef.current = Array.from({ length: VOICE_COUNT }, () => {
      const osc = actx.createOscillator()
      osc.type = 'sine'
      const gain = actx.createGain()
      gain.gain.value = 0
      const pan = actx.createStereoPanner()
      osc.connect(gain)
      gain.connect(pan)
      pan.connect(master)
      osc.start()
      return { osc, gain, pan, active: false }
    })
    return () => {
      alive = false
      handRef.current?.close()
      handRef.current = null
      for (const v of voicesRef.current) {
        try {
          v.osc.stop()
        } catch {
          /* already */
        }
      }
      void actx.close()
    }
  }, [])

  useEffect(() => {
    const g = masterRef.current
    const actx = ctxAudioRef.current
    if (!g || !actx) return
    g.gain.setTargetAtTime(muted || paused ? 0 : 0.18, actx.currentTime, 0.08)
  }, [muted, paused])

  useAnimationLoop(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    const { width, height } = sizeRef.current
    if (!width || !height) return
    const now = performance.now()
    const audio = audioRef.current
    const actx = ctxAudioRef.current

    if (video.readyState >= 2 && video.videoWidth > 0 && now - lastDetect.current > DETECT_MS) {
      const ts = now > lastDetect.current ? now : lastDetect.current + 1
      lastDetect.current = ts
      const lm = handRef.current
      if (lm) {
        const res = lm.detectForVideo(video, ts)
        const raw = res.landmarks.map((l) => {
          const palm = mirroredPoint(l[0], width, height)
          const tips = TIPS.map((i) => mirroredPoint(l[i], width, height))
          // openness: avg tip distance from palm / hand size
          const wrist = mirroredPoint(l[0], width, height)
          const mid = mirroredPoint(l[9], width, height)
          const handLen = dist(wrist, mid) || 1
          const open = clamp(
            tips.reduce((s, t) => s + dist(t, palm), 0) / (tips.length * handLen * 2.2),
            0,
            1,
          )
          return { tips, palm, open, palmX: palm.x }
        })
        raw.sort((a, b) => a.palmX - b.palmX)
        tipsRef.current = raw.map(({ tips, palm, open }) => ({ tips, palm, open }))
      }
    }

    drawDimWebcam(ctx, video, width, height, 0.4)
    ctx.fillStyle = 'rgba(8, 6, 16, 0.55)'
    ctx.fillRect(0, 0, width, height)

    const hands = tipsRef.current
    let maxOpen = 0
    for (let h = 0; h < 2; h++) {
      const hand = hands[h]
      for (let f = 0; f < 5; f++) {
        const voice = voicesRef.current[h * 5 + f]
        if (!voice || !actx) continue
        const t = actx.currentTime
        if (!hand) {
          voice.gain.gain.setTargetAtTime(0, t, 0.12)
          voice.active = false
          continue
        }
        const tip = hand.tips[f]
        const note = GLASS_SCALE[clamp(Math.floor((1 - tip.y / height) * GLASS_SCALE.length), 0, GLASS_SCALE.length - 1)]
        // slight per-finger offset
        const freq = note * (1 + f * 0.02)
        voice.osc.frequency.setTargetAtTime(freq, t, 0.05)
        voice.pan.pan.setTargetAtTime(clamp((tip.x / width) * 2 - 1, -1, 1), t, 0.05)
        const level = hand.open * 0.22 * (0.55 + (1 - tip.y / height) * 0.45)
        if (!voice.active && hand.open > 0.35) {
          voice.active = true
          audio?.sparkle(clamp((tip.x / width) * 2 - 1, -1, 1))
        }
        if (voice.active && hand.open < 0.18) voice.active = false
        voice.gain.gain.setTargetAtTime(level, t, 0.08)
        maxOpen = Math.max(maxOpen, hand.open)

        // visual voice
        const r = 6 + hand.open * 14
        const grd = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, r * 2)
        grd.addColorStop(0, `rgba(255,240,255,${0.3 + hand.open * 0.5})`)
        grd.addColorStop(1, 'rgba(160,120,255,0)')
        ctx.fillStyle = grd
        ctx.beginPath()
        ctx.arc(tip.x, tip.y, r * 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = `rgba(255,245,255,${0.5 + hand.open * 0.5})`
        ctx.beginPath()
        ctx.arc(tip.x, tip.y, 3.5, 0, Math.PI * 2)
        ctx.fill()
      }
      if (hand) {
        // arcs between fingertips
        ctx.strokeStyle = `rgba(220,200,255,${0.15 + hand.open * 0.35})`
        ctx.lineWidth = 1
        ctx.beginPath()
        hand.tips.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
        ctx.stroke()
      }
    }

    // hall size from two-hand distance
    if (hands.length === 2) {
      const d = dist(hands[0].palm, hands[1].palm)
      audio?.setPadBrightness(clamp(0.15 + maxOpen * 0.4 + (d / width) * 0.3, 0, 1))
    } else {
      audio?.setPadBrightness(clamp(0.15 + maxOpen * 0.5, 0, 1))
    }

    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.fillStyle = 'rgba(230,220,255,0.55)'
    ctx.fillText(
      hands.length ? 'open palm = choir swells · curl shut = hush · height = pitch' : 'show a hand — each fingertip is a voice',
      16,
      height - 16,
    )
  }, paused)

  return (
    <div
      className="relative size-full overflow-hidden bg-black"
      onPointerDown={() => {
        audioRef.current?.resume()
        void ctxAudioRef.current?.resume()
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 size-full touch-none" />
      <div className="absolute right-3 top-3">
        <SoundToggle muted={muted} onToggle={toggleMuted} />
      </div>
    </div>
  )
}

export default function ChoirHands({ paused }: ExperimentProps) {
  return (
    <WebcamGate hint="open your palm — each fingertip becomes a soft glass voice in a choir">
      {(video) => <Scene video={video} paused={paused} />}
    </WebcamGate>
  )
}

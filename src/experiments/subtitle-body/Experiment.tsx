import { useEffect, useRef, useState } from 'react'
import type { ImageSegmenter } from '@mediapipe/tasks-vision'
import { WebcamGate } from '@/shared/components/WebcamGate'
import { SoundToggle } from '@/shared/components/SoundToggle'
import type { ExperimentProps } from '@/shared/types'
import { useAnimationLoop } from '@/shared/hooks/useAnimationLoop'
import { useCanvas2D } from '@/shared/hooks/useCanvas2D'
import { useGlassAudio } from '@/shared/hooks/useGlassAudio'
import { createImageSegmenter } from '@/shared/lib/mediapipe'
import { drawDimWebcam } from '../_shared/asciiTools'

const MW = 160
const MH = 90
const MASK_T = 0.5
const MAX_LETTERS = 120
const DETECT_MS = 50

interface Letter {
  x: number
  y: number
  vx: number
  vy: number
  char: string
  stuck: boolean
  life: number
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}

function Scene({ video, paused }: { video: HTMLVideoElement } & ExperimentProps) {
  const { canvasRef, ctxRef, sizeRef } = useCanvas2D()
  const segRef = useRef<ImageSegmenter | null>(null)
  const lastDetect = useRef(0)
  const maskRef = useRef<{ data: Uint8Array; w: number; h: number }>({ data: new Uint8Array(MW * MH), w: MW, h: MH })
  const edgeRef = useRef<{ x: number; y: number }[]>([])
  const lettersRef = useRef<Letter[]>([])
  const charIdx = useRef(0)
  const [phrase, setPhrase] = useState('ONCE UPON A BODY')
  const phraseRef = useRef(phrase)
  const { audioRef, muted, toggleMuted } = useGlassAudio(paused, 0.3)

  useEffect(() => {
    phraseRef.current = phrase
  }, [phrase])

  useEffect(() => {
    let alive = true
    void createImageSegmenter().then((seg) => {
      if (alive) segRef.current = seg
      else seg.close()
    })
    return () => {
      alive = false
      segRef.current?.close()
      segRef.current = null
    }
  }, [])

  const sample = (sx: number, sy: number, width: number, height: number) => {
    const m = maskRef.current
    const mx = clamp(Math.floor((1 - sx / width) * (m.w - 1)), 0, m.w - 1)
    const my = clamp(Math.floor((sy / height) * (m.h - 1)), 0, m.h - 1)
    return m.data[my * m.w + mx] > 128
  }

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
      segRef.current?.segmentForVideo(video, ts, (result) => {
        const mask = result.confidenceMasks?.[0]
        if (!mask) return
        const src = mask.getAsFloat32Array()
        const mw = mask.width
        const mh = mask.height
        const out = maskRef.current.data
        // downsample + collect silhouette edge
        const edges: { x: number; y: number }[] = []
        for (let y = 1; y < MH - 1; y++) {
          const my = Math.min(mh - 1, Math.floor((y / MH) * mh))
          for (let x = 1; x < MW - 1; x++) {
            const mx = Math.min(mw - 1, Math.floor((x / MW) * mw))
            const v = src[my * mw + mx]
            const on = v > MASK_T
            out[y * MW + x] = on ? 255 : 0
            if (!on) continue
            // edge if any neighbour off
            const n1 = src[my * mw + Math.max(0, mx - 1)] <= MASK_T
            const n2 = src[my * mw + Math.min(mw - 1, mx + 1)] <= MASK_T
            const n3 = src[Math.max(0, my - 1) * mw + mx] <= MASK_T
            const n4 = src[Math.min(mh - 1, my + 1) * mw + mx] <= MASK_T
            if (n1 || n2 || n3 || n4) {
              edges.push({
                x: (1 - x / MW) * width,
                y: (y / MH) * height,
              })
            }
          }
        }
        edgeRef.current = edges
      })
    }

    drawDimWebcam(ctx, video, width, height, 0.85)
    ctx.fillStyle = 'rgba(8, 8, 12, 0.25)'
    ctx.fillRect(0, 0, width, height)

    const text = (phraseRef.current || 'SUBTITLE').toUpperCase()
    const edges = edgeRef.current
    if (edges.length && lettersRef.current.length < MAX_LETTERS && Math.random() < 0.55) {
      const e = edges[Math.floor(Math.random() * edges.length)]
      lettersRef.current.push({
        x: e.x,
        y: e.y,
        vx: (Math.random() - 0.5) * 20,
        vy: 0,
        char: text[charIdx.current++ % text.length],
        stuck: true,
        life: 1,
      })
      if (Math.random() < 0.2) audio?.sparkle(clamp((e.x / width) * 2 - 1, -1, 1))
    }

    ctx.font = '15px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const l of lettersRef.current) {
      if (l.stuck) {
        if (!sample(l.x, l.y, width, height)) {
          // support gone — tumble
          l.stuck = false
          l.vy = 40 + Math.random() * 40
          l.vx = (Math.random() - 0.5) * 60
        } else {
          // crawl along edge slowly
          l.x += Math.sin(now * 0.002 + l.y * 0.01) * 12 * delta
        }
      } else {
        l.vy += 180 * delta
        l.x += l.vx * delta
        l.y += l.vy * delta
        // restick if we hit silhouette again
        if (sample(l.x, l.y, width, height) && l.vy > 0) {
          l.stuck = true
          l.vy = 0
          l.vx = 0
          audio?.sparkle(clamp((l.x / width) * 2 - 1, -1, 1))
        }
      }
      l.life -= delta * 0.04
      ctx.fillStyle = l.stuck ? 'rgba(255,255,255,0.95)' : 'rgba(200,220,255,0.7)'
      ctx.shadowColor = l.stuck ? 'rgba(180,240,255,0.9)' : 'transparent'
      ctx.shadowBlur = l.stuck ? 8 : 0
      ctx.fillText(l.char, l.x, l.y)
    }
    ctx.shadowBlur = 0
    lettersRef.current = lettersRef.current.filter((l) => l.life > 0 && l.y < height + 30)

    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(220,230,255,0.5)'
    ctx.fillText('captions crawl your silhouette — move to break the line', 16, height - 16)
  }, paused)

  return (
    <div className="relative size-full overflow-hidden bg-black" onPointerDown={() => audioRef.current?.resume()}>
      <canvas ref={canvasRef} className="absolute inset-0 size-full touch-none" />
      <div className="absolute left-3 top-3 flex items-center gap-2">
        <label className="text-[10px] uppercase tracking-widest text-white/50">line</label>
        <input
          value={phrase}
          onChange={(e) => setPhrase(e.target.value.slice(0, 48))}
          className="w-56 rounded border border-white/20 bg-black/60 px-2 py-1 font-mono text-sm text-white/90 outline-none focus:border-white/50"
        />
      </div>
      <div className="absolute right-3 top-3">
        <SoundToggle muted={muted} onToggle={toggleMuted} />
      </div>
    </div>
  )
}

export default function SubtitleBody({ paused }: ExperimentProps) {
  return (
    <WebcamGate hint="stand so your silhouette fills the frame — captions will crawl your outline">
      {(video) => <Scene video={video} paused={paused} />}
    </WebcamGate>
  )
}

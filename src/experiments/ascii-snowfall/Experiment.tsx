import { useEffect, useRef, useState } from 'react'
import type { ImageSegmenter } from '@mediapipe/tasks-vision'
import { WebcamGate } from '@/shared/components/WebcamGate'
import { SoundToggle } from '@/shared/components/SoundToggle'
import type { ExperimentProps } from '@/shared/types'
import { createImageSegmenter } from '@/shared/lib/mediapipe'
import { drawDimWebcam, drawLabel, resizeCanvas, TinyAudio } from '../_shared/asciiTools'

interface Letter {
  x: number
  y: number
  vy: number
  drift: number
  char: string
  settled: boolean
  onSilhouette: boolean
  glow: number
}

const MASK_T = 0.5 // person-confidence threshold
const MAX_LETTERS = 220

function Scene({ video, paused }: { video: HTMLVideoElement } & ExperimentProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const segRef = useRef<ImageSegmenter | null>(null)
  const lettersRef = useRef<Letter[]>([])
  const audioRef = useRef(new TinyAudio())
  const charIdx = useRef(0)
  const [muted, setMuted] = useState(false)
  const [word, setWord] = useState('SNOW')
  const wordRef = useRef(word)

  useEffect(() => {
    wordRef.current = word
  }, [word])

  // silhouette mask state (persisted between frames)
  const maskRef = useRef<{ data: Float32Array | null; w: number; h: number }>({ data: null, w: 0, h: 0 })

  useEffect(() => {
    let alive = true
    const audio = audioRef.current
    void createImageSegmenter().then((seg) => {
      if (alive) segRef.current = seg
      else seg.close()
    })
    return () => {
      alive = false
      segRef.current?.close()
      audio.dispose()
    }
  }, [])

  useEffect(() => audioRef.current.setMuted(muted || paused), [muted, paused])

  useEffect(() => {
    let raf = 0
    let last = performance.now()

    // sample person confidence at canvas coords (video is drawn mirrored)
    const inside = (x: number, y: number, width: number, height: number) => {
      const m = maskRef.current
      if (!m.data) return false
      const mx = Math.floor((1 - x / width) * (m.w - 1))
      const my = Math.floor((y / height) * (m.h - 1))
      if (mx < 0 || my < 0 || mx >= m.w || my >= m.h) return false
      return m.data[my * m.w + mx] > MASK_T
    }

    let lastRender = 0
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (now - lastRender < 15) return // cap ~60fps (high-refresh displays)
      lastRender = now
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return
      const { width, height } = resizeCanvas(canvas)
      const dt = Math.min((now - last) / 1000, 0.04)
      last = now
      // full-brightness webcam (no darkening)
      if (video.readyState >= 2 && video.videoWidth > 0) {
        drawDimWebcam(ctx, video, width, height, 1)
      } else {
        ctx.fillStyle = '#08070a'
        ctx.fillRect(0, 0, width, height)
      }

      // update silhouette mask
      if (!paused && video.readyState >= 2) {
        segRef.current?.segmentForVideo(video, now, (result) => {
          const mask = result.confidenceMasks?.[0]
          if (mask) {
            const src = mask.getAsFloat32Array()
            const m = maskRef.current
            if (!m.data || m.data.length !== src.length) m.data = new Float32Array(src.length)
            m.data.set(src)
            m.w = mask.width
            m.h = mask.height
          }
        })
      }

      // spawn letters of the user's word, in order
      const text = (wordRef.current || 'SNOW').replace(/\s+/g, '')
      if (!paused && text && lettersRef.current.length < MAX_LETTERS && Math.random() < 0.5) {
        lettersRef.current.push({
          x: 20 + Math.random() * (width - 40),
          y: -16,
          vy: 28 + Math.random() * 44,
          drift: (Math.random() - 0.5) * 22,
          char: text[charIdx.current++ % text.length],
          settled: false,
          onSilhouette: false,
          glow: 0,
        })
      }

      const floor = height - 18
      ctx.font = '15px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      for (const l of lettersRef.current) {
        if (paused) {
          // freeze
        } else if (!l.settled) {
          l.x += Math.sin(now * 0.001 + l.y * 0.02) * 12 * dt + l.drift * dt
          const ny = l.y + l.vy * dt
          if (ny >= floor) {
            l.y = floor
            l.settled = true
            l.onSilhouette = false
          } else if (inside(l.x, ny, width, height)) {
            // land exactly on the silhouette edge: back up to the first free pixel
            let sy = ny
            while (sy > ny - 24 && inside(l.x, sy, width, height)) sy -= 1
            l.y = sy
            l.settled = true
            l.onSilhouette = true
            l.glow = 1
            audioRef.current.tone(800 + Math.random() * 500, 0.022, 0.14, 'sine', (l.x / width) * 2 - 1)
          } else {
            l.y = ny
          }
        } else if (l.y < floor) {
          if (inside(l.x, l.y, width, height)) {
            // silhouette moved into the letter — physically push it out
            const leftFree = !inside(l.x - 8, l.y, width, height)
            const rightFree = !inside(l.x + 8, l.y, width, height)
            let escaped = false
            for (let step = 1; step <= 36; step++) {
              if (!inside(l.x, l.y - step, width, height)) {
                l.y -= step
                escaped = true
                break
              }
            }
            if (leftFree !== rightFree) l.x += (rightFree ? 1 : -1) * 60 * dt
            if (!escaped) {
              // buried too deep — knock it loose
              l.settled = false
              l.onSilhouette = false
              l.vy = 30 + Math.random() * 30
            }
          } else if (!inside(l.x, l.y + 5, width, height)) {
            // support is gone — the silhouette moved away, letter falls again
            l.settled = false
            l.onSilhouette = false
            l.vy = 24 + Math.random() * 36
          }
        }
        l.glow = Math.max(0, l.glow - dt * 0.75)

        const silhouetteGlow = l.onSilhouette ? 1 : 0
        const flash = Math.max(l.glow, silhouetteGlow * 0.35)
        ctx.shadowColor = l.onSilhouette ? 'rgba(185, 245, 255, 0.95)' : 'rgba(0, 0, 0, 0.55)'
        ctx.shadowBlur = l.onSilhouette ? 8 + flash * 10 : l.settled ? 3 : 5
        ctx.fillStyle = l.onSilhouette
          ? `rgba(255, 255, 255, ${0.96 + flash * 0.04})`
          : l.settled
            ? 'rgba(225, 250, 255, 0.95)'
            : 'rgba(245, 253, 255, 0.88)'
        ctx.fillText(l.char, l.x, l.y)
      }
      ctx.shadowBlur = 0

      lettersRef.current = lettersRef.current.filter((l) => l.y < height + 30 && l.x > -20 && l.x < width + 20)
      drawLabel(ctx, 'letters of your word settle on your silhouette | move and they tumble', 18, height - 22)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [paused, video])

  return (
    <div className="relative size-full overflow-hidden bg-black">
      <canvas ref={canvasRef} className="size-full" onPointerDown={() => audioRef.current.resume()} />
      <div className="absolute left-3 top-3 flex items-center gap-2">
        <label className="text-[10px] uppercase tracking-widest text-white/50">word</label>
        <input
          value={word}
          onChange={(e) => setWord(e.target.value.toUpperCase().slice(0, 24))}
          className="w-36 rounded border border-white/20 bg-black/60 px-2 py-1 font-mono text-sm text-white/90 outline-none focus:border-white/50"
          placeholder="SNOW"
        />
        <button
          type="button"
          onClick={() => { lettersRef.current = []; charIdx.current = 0 }}
          className="rounded border border-white/20 bg-black/60 px-2 py-1 text-[10px] uppercase tracking-widest text-white/60 hover:border-white/50 hover:text-white/90"
        >
          clear
        </button>
      </div>
      <div className="absolute right-3 top-3">
        <SoundToggle muted={muted} onToggle={() => setMuted((v) => !v)} />
      </div>
    </div>
  )
}

export default function AsciiSnowfall({ paused }: ExperimentProps) {
  return <WebcamGate hint="camera gives the letters a silhouette to land on">{(video) => <Scene video={video} paused={paused} />}</WebcamGate>
}

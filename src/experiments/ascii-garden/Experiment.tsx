import { useEffect, useRef } from 'react'
import type { HandLandmarker } from '@mediapipe/tasks-vision'
import type { ExperimentProps } from '@/shared/types'
import { useCanvas2D } from '@/shared/hooks/useCanvas2D'
import { useAnimationLoop } from '@/shared/hooks/useAnimationLoop'
import { WebcamGate } from '@/shared/components/WebcamGate'
import { createHandLandmarker } from '@/shared/lib/mediapipe'
import { GLASS_SCALE } from '@/shared/lib/glassAudio'
import { useGlassAudio } from '@/shared/hooks/useGlassAudio'
import { SoundToggle } from '@/shared/components/SoundToggle'

const BG_CHARS = ' .`\',:;~-_+=*ivxnoaemwqdbkO0#%@'
const CELL_W = 9
const CELL_H = 13
const GRASS_CHARS = ['w', 'v', 'y', ',', "'"]
const PETAL_COLORS = ['#e36b6b', '#7fb4e3', '#e89ac0', '#e8d56b', '#f0f0e8']
const CROWN_COLORS = ['#a04848', '#d489ab', '#cbb89a']
const STEM_HEIGHTS = [2, 3, 5, 7, 9, 11, 13, 15, 17]
const PETAL_COUNTS = [0, 1, 3, 3, 5, 5, 7, 7, 7]
const PINCH_DIST = 4.2 // grid units
const PINCH_HOLD_MS = 300
const DROP_DEBOUNCE_MS = 240

interface Drop {
  x: number
  y: number
  vx: number
  vy: number
  char: string
  fallChar: string
  color: string
  age: number
}

interface Flower {
  col: number
  stage: number
  maxStage: number
  moisture: number
  lastGrow: number
  symbol: string
  petalColor: string
  crownColor: string
}

const DROP_VARIANTS = [
  { char: '·', fallChar: '·', vy: 0.16, vx: -0.05, color: '#e7fbff' },
  { char: '•', fallChar: '•', vy: 0.22, vx: 0.04, color: '#a7eaff' },
  { char: 'o', fallChar: '°', vy: 0.18, vx: 0.08, color: '#d7f6ff' },
  { char: '○', fallChar: 'o', vy: 0.2, vx: -0.02, color: '#bcefff' },
]

function webcamGray(n: number) {
  const v = Math.round(24 + Math.min(1, Math.max(0, n)) * 164)
  return `rgb(${v},${v},${v})`
}

function drawGardenGlyph(
  ctx: CanvasRenderingContext2D,
  char: string,
  x: number,
  y: number,
  color: string,
  shadow = 'rgba(0,0,0,0.72)',
) {
  ctx.fillStyle = shadow
  ctx.fillText(char, x + 1, y + 1)
  ctx.fillStyle = color
  ctx.fillText(char, x, y)
}

function Scene({ video, paused }: { video: HTMLVideoElement } & ExperimentProps) {
  const { canvasRef, ctxRef, sizeRef } = useCanvas2D()
  const sampleRef = useRef(document.createElement('canvas'))
  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const drops = useRef<Drop[]>([])
  const flowers = useRef<Flower[]>([])
  const grass = useRef<string[]>([])
  const pinch = useRef({ start: 0, lastDrop: 0 })
  const smooth = useRef<{ t?: { x: number; y: number }; i?: { x: number; y: number } }>({})
  const spark = useRef<{ x: number; y: number; life: number } | null>(null)
  const frame = useRef(0)
  const lastDetect = useRef(0)
  const { audioRef, muted, toggleMuted } = useGlassAudio(paused, 0.7)

  useEffect(() => {
    let alive = true
    void createHandLandmarker(1).then((lm) => {
      if (alive) landmarkerRef.current = lm
      else lm.close()
    })
    return () => {
      alive = false
      landmarkerRef.current?.close()
      landmarkerRef.current = null
    }
  }, [])

  const spawnDrop = (x: number, y: number) => {
    const now = performance.now()
    if (now - pinch.current.lastDrop < DROP_DEBOUNCE_MS) return
    pinch.current.lastDrop = now
    const v = DROP_VARIANTS[Math.floor(Math.random() * DROP_VARIANTS.length)]
    drops.current.push({
      x,
      y,
      vx: v.vx + (Math.random() - 0.5) * 0.16,
      vy: v.vy + Math.random() * 0.16,
      char: v.char,
      fallChar: v.fallChar,
      color: v.color,
      age: 0,
    })
    spark.current = { x, y, life: 1 }
    // pinch "squeeze a drop out of glass": high sparkle + tiny bright bell
    const { width } = sizeRef.current
    const pan = width ? (x / width) * 2 - 1 : 0
    audioRef.current?.sparkle(pan)
    audioRef.current?.bell(GLASS_SCALE[4 + Math.floor(Math.random() * 2)], {
      bright: 0.9,
      dur: 1.2,
      gain: 0.3,
      pan,
    })
  }

  const addMoisture = (col: number, rows: number) => {
    let flower = flowers.current.find((f) => Math.abs(f.col - col) <= 5)
    if (!flower) {
      flower = {
        col,
        stage: 0,
        maxStage: 6 + Math.floor(Math.random() * 3),
        moisture: 0,
        lastGrow: 0,
        symbol: Math.random() > 0.42 ? '0' : 'o',
        petalColor: PETAL_COLORS[Math.floor(Math.random() * PETAL_COLORS.length)],
        crownColor: CROWN_COLORS[Math.floor(Math.random() * CROWN_COLORS.length)],
      }
      flowers.current.push(flower)
    }
    flower.moisture++
    const needed = flower.stage < 2 ? 3 : 4
    const now = performance.now()
    if (flower.moisture >= needed && now - flower.lastGrow > 850) {
      flower.moisture = 0
      flower.lastGrow = now
      if (flower.stage < Math.min(flower.maxStage, STEM_HEIGHTS.length - 1)) {
        flower.stage++
        // growth chime: note climbs with the flower's stage
        const { width } = sizeRef.current
        const pan = width ? ((col * 9) / width) * 2 - 1 : 0
        const idx = Math.min(GLASS_SCALE.length - 1, flower.stage - 1)
        audioRef.current?.bell(GLASS_SCALE[idx], {
          bright: 0.45,
          dur: 3,
          gain: 0.5,
          pan,
        })
        if (flower.stage === flower.maxStage)
          audioRef.current?.flourish(true) // full bloom
      }
    }
    void rows
  }

  useAnimationLoop(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    const { width, height } = sizeRef.current
    if (!width || !height) return
    const cols = Math.floor(width / CELL_W)
    const rows = Math.floor(height / CELL_H)
    if (grass.current.length !== cols)
      grass.current = Array.from({ length: cols }, () =>
        Math.random() > 0.6 ? GRASS_CHARS[Math.floor(Math.random() * 5)] : ' ',
      )
    frame.current++

    ctx.fillStyle = '#0d0d0e'
    ctx.fillRect(0, 0, width, height)
    ctx.font = '10px ui-monospace, monospace'
    ctx.textBaseline = 'top'

    // webcam → ascii
    const sample = sampleRef.current
    if (sample.width !== cols || sample.height !== rows) {
      sample.width = cols
      sample.height = rows
    }
    const sctx = sample.getContext('2d', { willReadFrequently: true })
    if (sctx && video.readyState >= 2) {
      sctx.save()
      sctx.translate(cols, 0)
      sctx.scale(-1, 1)
      sctx.drawImage(video, 0, 0, cols, rows)
      sctx.restore()
      const px = sctx.getImageData(0, 0, cols, rows).data
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = (y * cols + x) * 4
          const b = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
          if (b < 6) continue
          const n = Math.min(1, Math.max(0, (b - 4) / 235)) ** 0.78
          ctx.fillStyle = webcamGray(n)
          ctx.fillText(BG_CHARS[Math.floor(n * (BG_CHARS.length - 1))], x * CELL_W, y * CELL_H)
        }
      }
    }

    // hand tracking + pinch
    const now = performance.now()
    const lm = landmarkerRef.current
    if (lm && video.readyState >= 2 && now - lastDetect.current > 33) {
      lastDetect.current = now
      const res = lm.detectForVideo(video, now)
      const hand = res.landmarks[0]
      if (hand) {
        const map = (p: { x: number; y: number }) => ({
          x: (1 - p.x) * width,
          y: p.y * height,
        })
        const lerp = (
          prev: { x: number; y: number } | undefined,
          cur: { x: number; y: number },
        ) =>
          prev
            ? { x: prev.x + (cur.x - prev.x) * 0.42, y: prev.y + (cur.y - prev.y) * 0.42 }
            : cur
        smooth.current.t = lerp(smooth.current.t, map(hand[4]))
        smooth.current.i = lerp(smooth.current.i, map(hand[8]))
        const t = smooth.current.t
        const i = smooth.current.i
        const dist = Math.hypot((t.x - i.x) / CELL_W, (t.y - i.y) / CELL_H)

        drawGardenGlyph(ctx, '●', t.x - 4, t.y - 6, '#ffffff')
        drawGardenGlyph(ctx, '●', i.x - 4, i.y - 6, '#ffffff')

        if (dist < PINCH_DIST) {
          if (!pinch.current.start) pinch.current.start = now
          if (now - pinch.current.start > PINCH_HOLD_MS)
            spawnDrop((t.x + i.x) / 2, (t.y + i.y) / 2)
        } else {
          pinch.current.start = 0
        }
      } else {
        smooth.current = {}
        pinch.current.start = 0
      }
    }

    // drops physics
    const groundY = (rows - 3) * CELL_H
    for (let d = drops.current.length - 1; d >= 0; d--) {
      const drop = drops.current[d]
      drop.age++
      drop.vy += 0.18
      drop.x += drop.vx
      drop.y += drop.vy
      if (drop.y >= groundY) {
        addMoisture(Math.floor(drop.x / CELL_W), rows)
        drops.current.splice(d, 1)
        // soft low "drop into earth" plink
        audioRef.current?.bell(GLASS_SCALE[Math.floor(Math.random() * 2)] / 2, {
          bright: 0.2,
          dur: 2.2,
          gain: 0.3,
          pan: (drop.x / width) * 2 - 1,
        })
      }
    }

    // grass flicker
    if (frame.current % 24 === 0) {
      const c = Math.floor(Math.random() * cols)
      grass.current[c] = GRASS_CHARS[Math.floor(Math.random() * 5)]
    }

    // grass rows
    for (let c = 0; c < cols; c++) {
      drawGardenGlyph(ctx, GRASS_CHARS[c % 5], c * CELL_W, (rows - 2) * CELL_H, '#f0ea83')
      if (grass.current[c] !== ' ') {
        drawGardenGlyph(
          ctx,
          grass.current[c],
          c * CELL_W,
          (rows - 3) * CELL_H,
          c % 3 === 0 ? '#b8d66a' : '#f0ea83',
        )
      }
    }

    // flowers
    for (const f of flowers.current) {
      const baseRow = rows - 4
      const stemH = STEM_HEIGHTS[f.stage]
      for (let s = 0; s < stemH; s++) {
        const y = baseRow - s
        drawGardenGlyph(ctx, '|', f.col * CELL_W, y * CELL_H, '#e4f27d')
        if (s > 0 && s < stemH - 1) {
          const side = s % 2 === 0 ? -1 : 1
          drawGardenGlyph(ctx, side < 0 ? '/' : '\\', (f.col + side) * CELL_W, y * CELL_H, '#a9d96a')
        }
      }
      const topY = baseRow - stemH
      const petals = PETAL_COUNTS[f.stage]
      if (petals <= 1) {
        drawGardenGlyph(ctx, f.symbol, f.col * CELL_W, topY * CELL_H, f.crownColor)
      } else {
        const startX = -Math.floor((petals + 2) / 2)
        drawGardenGlyph(ctx, f.symbol, f.col * CELL_W, (topY - 1) * CELL_H, f.crownColor)
        drawGardenGlyph(ctx, '(', (f.col + startX) * CELL_W, topY * CELL_H, '#e4f27d')
        for (let p = 0; p < petals; p++)
          drawGardenGlyph(ctx, f.symbol, (f.col + startX + 1 + p) * CELL_W, topY * CELL_H, f.petalColor)
        drawGardenGlyph(ctx, ')', (f.col + startX + 1 + petals) * CELL_W, topY * CELL_H, '#e4f27d')
      }
    }

    // drops render
    for (const d of drops.current) {
      const char = d.age > 18 ? d.fallChar : d.age > 9 ? '·' : d.char
      drawGardenGlyph(ctx, char, d.x, d.y, d.color, 'rgba(0,0,0,0.62)')
    }
    if (spark.current) {
      drawGardenGlyph(ctx, '✦', spark.current.x - 4, spark.current.y - 10, `rgba(255,255,255,${spark.current.life})`)
      spark.current.life -= 0.08
      if (spark.current.life <= 0) spark.current = null
    }
  }, paused)

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="h-full w-full touch-none" />
      <SoundToggle muted={muted} onToggle={toggleMuted} />
    </div>
  )
}

export default function AsciiGarden({ paused }: ExperimentProps) {
  return (
    <WebcamGate hint="an ASCII garden — pinch your thumb and index finger to drop water and grow flowers">
      {(video) => <Scene video={video} paused={paused} />}
    </WebcamGate>
  )
}

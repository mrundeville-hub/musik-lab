import { useEffect, useRef, useState } from 'react'
import type { FaceLandmarker, HandLandmarker } from '@mediapipe/tasks-vision'
import { WebcamGate } from '@/shared/components/WebcamGate'
import { SoundToggle } from '@/shared/components/SoundToggle'
import type { ExperimentProps } from '@/shared/types'
import { createFaceLandmarker, createHandLandmarker } from '@/shared/lib/mediapipe'
import { drawLabel, resizeCanvas, TinyAudio } from '../_shared/asciiTools'

// ---- mask point clouds sampled from reference images -----------------------
// Each mask is built from a background-removed PNG in public/masks/: opaque
// pixels become particles, keeping their colour. Depth is a dome fitted to
// the silhouette so the cloud reads as 3D and lights up (lambert + gloss)
// as the head rotates.
// Local mask space: origin between the eyes, 1.0 = eye distance,
// +x viewer-right, +y down the face, +z out of the face toward the camera.

interface MPt {
  x: number; y: number; z: number
  nx: number; ny: number; nz: number
  r: number; g: number; b: number
  edge: number // 0 at silhouette → 1 deep inside; used to fade the rim
}

interface Mask {
  name: string
  pts: MPt[]
  faceHeight: number
  fitScale: number
  fitYOffset: number
}

interface MaskDef {
  name: string
  src: string
  faceHeight: number
  anchorY: number
  fitScale: number
  fitYOffset?: number
}

const MASK_DEFS = [
  { name: 'BARONG LACQUER', src: '/masks/barong_reference_cut.png', faceHeight: 4.8, anchorY: 0.43, fitScale: 1.34, fitYOffset: 0.02 },
  { name: 'CRACKED GHOST', src: '/masks/ghost_reference_cut.png', faceHeight: 4.7, anchorY: 0.36, fitScale: 1.28, fitYOffset: 0.05 },
  { name: 'WHITE ONI', src: '/masks/oni_reference_cut.png', faceHeight: 4.35, anchorY: 0.38, fitScale: 1.18, fitYOffset: 0.04 },
  { name: 'DUMMY', src: '/masks/dummy_generated.png', faceHeight: 4.25, anchorY: 0.39, fitScale: 1.18, fitYOffset: 0.02 },
  { name: 'PORCELAIN SKULL', src: '/masks/skull_generated.png', faceHeight: 4.2, anchorY: 0.39, fitScale: 1.2, fitYOffset: 0.04 },
  { name: 'DOMINO CHARM', src: '/masks/domino_generated.png', faceHeight: 2.25, anchorY: 0.48, fitScale: 0.78, fitYOffset: -0.04 },
  { name: 'LUCHA HEART', src: '/masks/lucha_generated.png', faceHeight: 4.35, anchorY: 0.39, fitScale: 1.22, fitYOffset: 0.03 },
  { name: 'THOUSAND EYES', src: '/masks/eyes_generated.png', faceHeight: 4.45, anchorY: 0.37, fitScale: 1.2, fitYOffset: 0.05 },
  { name: 'GOLD NASO', src: '/masks/naso_generated.png', faceHeight: 4.35, anchorY: 0.38, fitScale: 1.18, fitYOffset: 0.04 },
] satisfies MaskDef[]

const N_PARTICLES = 6800
const DOME_Z = 1.15
const FACE_DETECT_MS = 84
const HAND_DETECT_MS = 130

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

async function buildFromImage(def: MaskDef): Promise<MPt[]> {
  const img = await loadImage(def.src)
  // rasterise at a higher resolution so the portrait keeps its real texture
  // and we can sample densely enough to read as a continuous lit surface.
  const side = 280
  const k = side / Math.max(img.width, img.height)
  const w = Math.max(1, Math.round(img.width * k))
  const h = Math.max(1, Math.round(img.height * k))
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const cx2 = cv.getContext('2d', { willReadFrequently: true })!
  cx2.drawImage(img, 0, 0, w, h)
  const data = cx2.getImageData(0, 0, w, h).data
  const at = (x: number, y: number) => data[(y * w + x) * 4 + 3]

  // collect opaque pixels + a cheap "depth from edge" (how far inside the
  // silhouette) by scanning a small neighbourhood for transparent pixels.
  type Px = { x: number; y: number; r: number; g: number; b: number; edge: number }
  const px: Px[] = []
  const R = 5 // edge probe radius in pixels
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4
      if (data[o + 3] < 110) continue
      // shortest distance to a transparent neighbour, capped at R
      let near = R
      for (let dy = -R; dy <= R && near > 0; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const nx = x + dx, ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || at(nx, ny) < 110) {
            const d = Math.hypot(dx, dy)
            if (d < near) near = d
          }
        }
      }
      const edge = Math.min(1, near / R) // 0 at rim, 1 deep inside
      px.push({ x, y, r: data[o], g: data[o + 1], b: data[o + 2], edge })
    }
  }
  if (!px.length) return []

  // bounding box → normalise into mask space
  let x0 = w, x1 = 0, y0 = h, y1 = 0
  for (const p of px) {
    if (p.x < x0) x0 = p.x
    if (p.x > x1) x1 = p.x
    if (p.y < y0) y0 = p.y
    if (p.y > y1) y1 = p.y
  }
  const bw = Math.max(1, x1 - x0)
  const bh = Math.max(1, y1 - y0)
  const scale = def.faceHeight / bh
  const mcx = (x0 + x1) / 2
  const mcy = (y0 + y1) / 2
  const anchorY = y0 + bh * def.anchorY
  const rx = (bw / 2) * scale
  const ry = (bh / 2) * scale

  // thin to N_PARTICLES with an even stride; bilinear-smooth the colour so
  // neighbouring splats blend instead of showing raster aliasing.
  const sampleRGB = (fx: number, fy: number) => {
    const ix = Math.floor(fx), iy = Math.floor(fy)
    const tx = fx - ix, ty = fy - iy
    const s = (px: number, py: number) => {
      const cx = Math.max(0, Math.min(w - 1, px))
      const cy = Math.max(0, Math.min(h - 1, py))
      const o = (cy * w + cx) * 4
      return data[o + 3] >= 110 ? [data[o], data[o + 1], data[o + 2]] : null
    }
    const c00 = s(ix, iy), c10 = s(ix + 1, iy), c01 = s(ix, iy + 1), c11 = s(ix + 1, iy + 1)
    let r = 0, g = 0, b = 0, wsum = 0
    const acc = (c: number[] | null, wt: number) => { if (c) { r += c[0] * wt; g += c[1] * wt; b += c[2] * wt; wsum += wt } }
    acc(c00, (1 - tx) * (1 - ty)); acc(c10, tx * (1 - ty)); acc(c01, (1 - tx) * ty); acc(c11, tx * ty)
    if (!wsum) return null
    return [r / wsum, g / wsum, b / wsum]
  }

  const pts: MPt[] = []
  for (let i = 0; i < N_PARTICLES; i++) {
    const p = px[Math.floor(Math.random() * px.length)]
    // jitter the sample within the source cell so coverage is organic, not a raster cutout
    const jx = p.x + (Math.random() - 0.5) * 1.8
    const jy = p.y + (Math.random() - 0.5) * 1.8
    const col = sampleRGB(jx, jy) ?? [p.r, p.g, p.b]
    const x = (jx - mcx) * scale
    const centeredY = (jy - mcy) * scale
    const y = (jy - anchorY) * scale
    // dome depth fitted to the silhouette box; normal = ellipsoid gradient
    const u = x / rx
    const v = centeredY / ry
    const q = Math.max(0, 1 - u * u - v * v)
    const dz = Math.sqrt(q)
    const z = dz * DOME_Z - 0.15
    const nl = Math.hypot(u / rx, v / ry, dz / DOME_Z) || 1
    pts.push({
      x, y, z,
      nx: u / rx / nl, ny: v / ry / nl, nz: Math.max(0.15, dz / DOME_Z) / nl,
      r: col[0], g: col[1], b: col[2],
      edge: p.edge,
    })
  }
  return pts
}

const FOCAL = 7
const THUMB_TIP = 4
const INDEX_TIP = 8
// light from upper-front-left, half-vector for cheap gloss
const LX = 0.32, LY = -0.5, LZ = 0.8
const LL = Math.hypot(LX, LY, LZ)
const HX = LX / LL, HY = LY / LL, HZ = LZ / LL + 1
const HL = Math.hypot(HX, HY, HZ)

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  freeUntil: number
}

function lm3(lm: { x: number; y: number; z: number }, w: number, h: number) {
  // mirrored pixel space; z flipped to keep the basis right-handed after mirroring
  return { x: (1 - lm.x) * w, y: lm.y * h, z: -lm.z * w }
}

function len3(v: { x: number; y: number; z: number }) {
  return Math.hypot(v.x, v.y, v.z) || 1
}

function norm3(v: { x: number; y: number; z: number }) {
  const l = len3(v)
  return { x: v.x / l, y: v.y / l, z: v.z / l }
}

function cross3(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function Scene({ video, paused }: { video: HTMLVideoElement } & ExperimentProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const faceRef = useRef<FaceLandmarker | null>(null)
  const handRef = useRef<HandLandmarker | null>(null)
  const audioRef = useRef(new TinyAudio())
  const [muted, setMuted] = useState(false)
  const [maskName, setMaskName] = useState('LOADING')
  const masksRef = useRef<Mask[]>([])
  const maskIdxRef = useRef(0)
  const pinchedRef = useRef(false)
  const lastSwitch = useRef(0)
  const lastFaceDetect = useRef(0)
  const lastHandDetect = useRef(0)
  const currentPinched = useRef(false)
  const sortFrame = useRef(0)
  const particles = useRef<Particle[]>(
    Array.from({ length: N_PARTICLES }, (_, i) => ({
      // deterministic scatter (pure init) — physics pulls them onto the mask immediately
      x: ((i * 97) % 600), y: ((i * 53) % 400), vx: 0, vy: 0, freeUntil: 0,
    })),
  )
  const depths = useRef(new Float32Array(N_PARTICLES))
  const order = useRef<number[]>(Array.from({ length: N_PARTICLES }, (_, i) => i))
  const frame = useRef({
    ox: 0, oy: 0, scale: 60, hasFace: false,
    bx: { x: 1, y: 0, z: 0 }, by: { x: 0, y: 1, z: 0 }, bz: { x: 0, y: 0, z: 1 },
  })

  useEffect(() => {
    const el = videoRef.current
    if (!el || !video.srcObject) return
    el.srcObject = video.srcObject
    void el.play().catch(() => {})
  }, [video])

  useEffect(() => {
    let alive = true
    const audio = audioRef.current
    void Promise.all(MASK_DEFS.map((d) => buildFromImage(d))).then((all) => {
      if (!alive) return
      masksRef.current = MASK_DEFS.map((d, i) => ({
        name: d.name,
        pts: all[i],
        faceHeight: d.faceHeight,
        fitScale: d.fitScale,
        fitYOffset: d.fitYOffset ?? 0,
      })).filter((m) => m.pts.length)
      if (masksRef.current.length) setMaskName(masksRef.current[0].name)
    })
    void Promise.all([createFaceLandmarker(), createHandLandmarker(1)]).then(([face, hand]) => {
      if (alive) {
        faceRef.current = face
        handRef.current = hand
      } else {
        face.close()
        hand.close()
      }
    })
    return () => {
      alive = false
      faceRef.current?.close()
      handRef.current?.close()
      audio.dispose()
    }
  }, [])

  useEffect(() => audioRef.current.setMuted(muted || paused), [muted, paused])

  useEffect(() => {
    let raf = 0
    let last = performance.now()
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
      ctx.clearRect(0, 0, width, height)

      const masks = masksRef.current
      if (!masks.length) {
        drawLabel(ctx, 'summoning masks…', 18, height - 22)
        return
      }
      const mask = masks[maskIdxRef.current % masks.length]

      const f = frame.current
      if (!f.ox) { f.ox = width / 2; f.oy = height / 2 }

      if (!paused && video.readyState >= 2) {
        const shouldDetectFace = now - lastFaceDetect.current > FACE_DETECT_MS
        const face = shouldDetectFace ? faceRef.current?.detectForVideo(video, now).faceLandmarks[0] : undefined
        if (shouldDetectFace) lastFaceDetect.current = now
        if (face) {
          const eyeL = lm3(face[33], width, height)
          const eyeR = lm3(face[263], width, height)
          const cheekL = lm3(face[234], width, height)
          const cheekR = lm3(face[454], width, height)
          const forehead = lm3(face[10], width, height)
          const nose = lm3(face[1], width, height)
          const chin = lm3(face[152], width, height)

          const eyeMid = {
            x: (eyeL.x + eyeR.x) / 2,
            y: (eyeL.y + eyeR.y) / 2,
            z: (eyeL.z + eyeR.z) / 2,
          }
          const bx = norm3({ x: eyeR.x - eyeL.x, y: eyeR.y - eyeL.y, z: eyeR.z - eyeL.z })
          const rawDown = { x: chin.x - forehead.x, y: chin.y - forehead.y, z: chin.z - forehead.z }
          const dot = rawDown.x * bx.x + rawDown.y * bx.y + rawDown.z * bx.z
          const by = norm3({
            x: rawDown.x - bx.x * dot,
            y: rawDown.y - bx.y * dot,
            z: rawDown.z - bx.z * dot,
          })
          // bz must point OUT of the face toward the camera (mask +z), so the
          // dome bulges toward the viewer. cross3(bx,by) points into the screen
          // in this y-down pixel basis, which renders the mask inside-out.
          const bz = norm3(cross3(by, bx))

          const faceH = len3({ x: chin.x - forehead.x, y: chin.y - forehead.y, z: chin.z - forehead.z })
          const faceW = len3({ x: cheekR.x - cheekL.x, y: cheekR.y - cheekL.y, z: cheekR.z - cheekL.z })
          const eyeW = len3({ x: eyeR.x - eyeL.x, y: eyeR.y - eyeL.y, z: eyeR.z - eyeL.z })
          const heightScale = (faceH * mask.fitScale) / mask.faceHeight
          const widthScale = (faceW * 1.12) / Math.max(2.1, mask.faceHeight * 0.72)
          const eyeScale = (eyeW * 1.72) / Math.max(1.2, mask.faceHeight * 0.35)
          const targetScale = Math.max(42, Math.min(240, heightScale * 0.7 + widthScale * 0.2 + eyeScale * 0.1))
          const targetOx = eyeMid.x + by.x * targetScale * (0.08 + mask.fitYOffset)
          const targetOy = eyeMid.y + by.y * targetScale * (0.08 + mask.fitYOffset)
          const targetOz = eyeMid.z + (nose.z - eyeMid.z) * 0.25
          const smooth = f.hasFace ? 0.34 : 1

          f.ox = mix(f.ox, targetOx, smooth)
          f.oy = mix(f.oy, targetOy, smooth)
          f.scale = mix(f.scale, targetScale, smooth)
          f.bx = { x: mix(f.bx.x, bx.x, smooth), y: mix(f.bx.y, bx.y, smooth), z: mix(f.bx.z, bx.z, smooth) }
          f.by = { x: mix(f.by.x, by.x, smooth), y: mix(f.by.y, by.y, smooth), z: mix(f.by.z, by.z, smooth) }
          f.bz = { x: mix(f.bz.x, bz.x, smooth), y: mix(f.bz.y, bz.y, smooth), z: mix(f.bz.z, bz.z, smooth) }
          f.hasFace = true
          void targetOz
        }

        const shouldDetectHand = now - lastHandDetect.current > HAND_DETECT_MS
        if (shouldDetectHand) {
          lastHandDetect.current = now
          const hands = handRef.current?.detectForVideo(video, now).landmarks ?? []
          currentPinched.current = hands.some((h) => {
            const t = h[THUMB_TIP]
            const i = h[INDEX_TIP]
            return Math.hypot(t.x - i.x, t.y - i.y) < 0.05
          })
        }
        const pinched = currentPinched.current
        if (pinched && !pinchedRef.current && now - lastSwitch.current > 900) {
          lastSwitch.current = now
          maskIdxRef.current = (maskIdxRef.current + 1) % masks.length
          setMaskName(masks[maskIdxRef.current].name)
          for (const p of particles.current) {
            const a = Math.random() * Math.PI * 2
            const sp = 250 + Math.random() * 600
            p.vx += Math.cos(a) * sp
            p.vy += Math.sin(a) * sp
            p.freeUntil = now + 150 + Math.random() * 600
          }
          audioRef.current.tone(140, 0.07, 1.1, 'sine', 0)
          audioRef.current.tone(210, 0.04, 1.5, 'triangle', 0)
        }
        pinchedRef.current = pinched
      }

      const mpts = mask.pts
      const focalPx = FOCAL * f.scale

      for (let i = 0; i < N_PARTICLES; i++) {
        const p = particles.current[i]
        const m = mpts[i % mpts.length]
        // coherent breathing tremble (no per-frame random scatter, so the
        // surface stays continuous like real fabric/skin over the face)
        const jx = m.x + Math.sin(now * 0.0016 + i * 0.7) * 0.012
        const jy = m.y + Math.cos(now * 0.0013 + i * 1.1) * 0.012
        const wx = f.bx.x * jx + f.by.x * jy + f.bz.x * m.z
        const wy = f.bx.y * jx + f.by.y * jy + f.bz.y * m.z
        const wz = f.bx.z * jx + f.by.z * jy + f.bz.z * m.z
        const s = focalPx / Math.max(focalPx * 0.3, focalPx - wz * f.scale)
        const tx = f.ox + wx * f.scale * s
        const ty = f.oy + wy * f.scale * s
        depths.current[i] = wz

        if (!paused) {
          const free = now < p.freeUntil
          if (!free) {
            p.vx += (tx - p.x) * 34 * dt
            p.vy += (ty - p.y) * 34 * dt
          }
          const damp = 1 - Math.min(1, (free ? 2.2 : 8) * dt)
          p.vx *= damp
          p.vy *= damp
          p.x += p.vx * dt
          p.y += p.vy * dt
        }
      }

      sortFrame.current = (sortFrame.current + 1) % 5
      if (sortFrame.current === 0) order.current.sort((a, b) => depths.current[a] - depths.current[b])

      // splat radius scales with the projected face so the cloud always reads
      // as a continuous skin (neighbours overlap) regardless of distance.
      const baseR = Math.max(1.05, f.scale * 0.019)
      // collect the brightest particles for a cheap additive bloom pass.
      const glowX: number[] = [], glowY: number[] = [], glowR: number[] = [], glowC: string[] = []

      ctx.globalCompositeOperation = 'source-over'
      for (const i of order.current) {
        const p = particles.current[i]
        const m = mpts[i % mpts.length]
        // rotate the normal into world space and light it (gentle, photo-true)
        const nwx = f.bx.x * m.nx + f.by.x * m.ny + f.bz.x * m.nz
        const nwy = f.bx.y * m.nx + f.by.y * m.ny + f.bz.y * m.nz
        const nwz = f.bx.z * m.nx + f.by.z * m.ny + f.bz.z * m.nz
        const diff = Math.max(0, (nwx * LX + nwy * LY + nwz * LZ) / LL)
        const specDot = Math.max(0, (nwx * HX + nwy * HY + nwz * HZ) / HL)
        const spec = specDot ** 44 * 34 // tighter, far softer highlight
        const lit = 0.9 + 0.36 * diff
        const cr = Math.min(255, m.r * lit + spec)
        const cg = Math.min(255, m.g * lit + spec)
        const cb = Math.min(255, m.b * lit + spec)
        const depth01 = Math.max(0, Math.min(1, (depths.current[i] + 1.2) / 2.8))
        // silhouette fade: rim particles go translucent so the mask blends onto
        // the face instead of showing a hard photo cutout.
        const edgeFade = 0.2 + Math.min(1, m.edge * 2.2) * 0.8
        const r = baseR * (0.72 + depth01 * 0.42)

        // Each particle is visible as a point, not a continuous pasted PNG.
        ctx.globalAlpha = 0.16 * edgeFade
        ctx.fillStyle = `rgb(${cr | 0},${cg | 0},${cb | 0})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, r * 1.45, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 0.98 * edgeFade
        ctx.fillRect(p.x - r * 0.35, p.y - r * 0.35, r * 0.7, r * 0.7)

        const lum = (cr + cg + cb) / 765
        if (glowX.length < 180 && lum > 0.74 && edgeFade > 0.5) {
          glowX.push(p.x); glowY.push(p.y); glowR.push(r * 1.45)
          glowC.push(`rgb(${cr | 0},${cg | 0},${cb | 0})`)
        }
      }

      // ethereal bloom: additive halos on the brightest particles only
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 0.05
      for (let k = 0; k < glowX.length; k++) {
        ctx.fillStyle = glowC[k]
        ctx.beginPath()
        ctx.arc(glowX[k], glowY[k], glowR[k], 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1

      drawLabel(
        ctx,
        `${mask.name}${f.hasFace ? '' : ' — show your face'} | pinch thumb+index: dissolve into the next mask`,
        18,
        height - 22,
      )
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [paused, video])

  return (
    <div className="relative size-full overflow-hidden bg-black">
      <video
        ref={videoRef}
        playsInline
        muted
        className="absolute inset-0 size-full -scale-x-100 object-cover"
      />
      <div className="absolute inset-0 bg-black/10" />
      <canvas ref={canvasRef} className="absolute inset-0 size-full" onPointerDown={() => audioRef.current.resume()} />
      <div className="absolute left-3 top-3 font-mono text-xs uppercase tracking-widest text-white/60">
        {maskName}
      </div>
      <div className="absolute right-3 top-3">
        <SoundToggle muted={muted} onToggle={() => setMuted((v) => !v)} />
      </div>
    </div>
  )
}

export default function SpiritMasks({ paused }: ExperimentProps) {
  return <WebcamGate hint="camera maps a particle mask onto your face">{(video) => <Scene video={video} paused={paused} />}</WebcamGate>
}

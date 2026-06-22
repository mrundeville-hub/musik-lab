import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { FaceLandmarker, HandLandmarker } from '@mediapipe/tasks-vision'
import type { ExperimentProps } from '@/shared/types'
import { WebcamGate } from '@/shared/components/WebcamGate'
import { createFaceLandmarker, createHandLandmarker } from '@/shared/lib/mediapipe'

// ── cloth grid ─────────────────────────────────────────────────
const C = 12 // particle columns per panel
const R = 16 // particle rows
const N = C * R
const INDEX_TIP = 8
const ITER = 4 // constraint relaxation passes
const DAMP = 0.97 // Verlet velocity damping
const GRAV = 16 // gravity (world units/s²)
const FOLDK = 2.6 // column → fold phase (vertical pleats)

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}

// procedural lace: cream thread where the rosette/net pattern is solid,
// transparent in the holes — used as the panels' colour+alpha map.
function laceTexture(): THREE.Texture {
  const S = 256
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const ctx = cv.getContext('2d')!
  ctx.clearRect(0, 0, S, S)
  ctx.fillStyle = '#efe9dd'
  const TILE = 10
  const cells = 64
  const px = S / cells
  for (let gy = 0; gy < cells; gy++) {
    for (let gx = 0; gx < cells; gx++) {
      const tu = ((gx % TILE) - TILE / 2 + 0.5)
      const tv = ((gy % TILE) - TILE / 2 + 0.5)
      const rr = Math.hypot(tu, tv)
      let solid = false
      if (rr < 4.3) {
        for (const ring of [1.4, 2.7, 4.0]) if (Math.abs(rr - ring) < 0.55) solid = true
        if (rr < 1.1) solid = solid || 0.55 + 0.45 * Math.cos(8 * Math.atan2(tv, tu)) > 0.4
      } else {
        solid = (gx & 1) === 0 && (gy & 1) === 0 // fine net
      }
      if (solid) ctx.fillRect(gx * px, gy * px, px + 0.5, px + 0.5)
    }
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(2.2, 3)
  return tex
}

interface Panel {
  pos: Float32Array // N*3
  prev: Float32Array
}
function makePanel(): Panel {
  return { pos: new Float32Array(N * 3), prev: new Float32Array(N * 3) }
}

// lay a panel out flat & still, hanging from rod (rodY) between x0 (outer) and x1 (inner)
function initPanel(p: Panel, x0: number, x1: number, rodY: number, h: number) {
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const i = (r * C + c) * 3
      const x = x0 + (x1 - x0) * (c / (C - 1))
      const y = rodY - h * (r / (R - 1))
      const z = 0.18 * Math.sin(c * FOLDK)
      p.pos[i] = p.prev[i] = x
      p.pos[i + 1] = p.prev[i + 1] = y
      p.pos[i + 2] = p.prev[i + 2] = z
    }
  }
}

// one Verlet step. pinX/pinY give the C pinned top-row positions.
function step(
  p: Panel, pinX: number[], pinY: number,
  restDX: number, restDY: number,
  t: number, sway: number, foldDepth: number, foldDir: number, h: number,
) {
  const { pos, prev } = p
  const h2 = h * h
  // integrate (top row pinned)
  for (let i = 0; i < N; i++) {
    const o = i * 3
    if (i < C) {
      pos[o] = prev[o] = pinX[i]
      pos[o + 1] = prev[o + 1] = pinY
      pos[o + 2] = prev[o + 2] = 0.18 * Math.sin((i % C) * FOLDK)
      continue
    }
    const col = i % C
    const row = (i / C) | 0
    const hang = row / (R - 1)
    const wy = pos[o + 1]
    const ax = sway * Math.sin(t * 1.1 + wy * 0.7 + foldDir * 1.5) * hang
    const az = sway * 0.7 * Math.sin(t * 0.9 + col * 0.6 + foldDir) * hang
    const acc = [ax, -GRAV, az]
    for (let k = 0; k < 3; k++) {
      const cur = pos[o + k]
      const v = (cur - prev[o + k]) * DAMP
      prev[o + k] = cur
      let nx = cur + v + acc[k] * h2
      const d = nx - cur
      if (d > 0.5) nx = cur + 0.5
      else if (d < -0.5) nx = cur - 0.5
      pos[o + k] = nx
    }
  }
  // satisfy distance constraints
  for (let it = 0; it < ITER; it++) {
    for (let r = 0; r < R; r++)
      for (let c = 0; c < C - 1; c++) constrain(pos, r * C + c, r * C + c + 1, restDX)
    for (let c = 0; c < C; c++)
      for (let r = 0; r < R - 1; r++) constrain(pos, r * C + c, (r + 1) * C + c, restDY)
  }
  // pull each column toward its fold depth → vertical pleats. taper toward the
  // hem so the free bottom edge stays calm instead of curling/twisting.
  for (let i = C; i < N; i++) {
    const o = i * 3
    const row = (i / C) | 0
    const taper = 1 - 0.55 * (row / (R - 1))
    const tz = foldDepth * taper * Math.sin((i % C) * FOLDK)
    pos[o + 2] += (tz - pos[o + 2]) * 0.25
  }
}

function constrain(pos: Float32Array, a: number, b: number, rest: number) {
  const ao = a * 3, bo = b * 3
  const dx = pos[bo] - pos[ao]
  const dy = pos[bo + 1] - pos[ao + 1]
  const dz = pos[bo + 2] - pos[ao + 2]
  const dist = Math.hypot(dx, dy, dz) || 1e-4
  const diff = (dist - rest) / dist
  const aPin = a < C
  const bPin = b < C
  const wa = aPin ? 0 : bPin ? 1 : 0.5
  const wb = bPin ? 0 : aPin ? 1 : 0.5
  pos[ao] += dx * diff * wa
  pos[ao + 1] += dy * diff * wa
  pos[ao + 2] += dz * diff * wa
  pos[bo] -= dx * diff * wb
  pos[bo + 1] -= dy * diff * wb
  pos[bo + 2] -= dz * diff * wb
}

// ── the curtain scene (inside the r3f canvas) ──────────────────
function Curtains({ video, paused }: { video: HTMLVideoElement } & ExperimentProps) {
  const { viewport } = useThree()
  const handLm = useRef<HandLandmarker | null>(null)
  const faceLm = useRef<FaceLandmarker | null>(null)
  const lastDetect = useRef(0)
  const tips = useRef<{ x: number; y: number }[]>([])
  const face = useRef<{ cx: number; cy: number; w: number; h: number } | null>(null)
  const innerL = useRef(0) // leading-edge x of each half (world)
  const innerR = useRef(0)
  const inited = useRef(false)
  const initedFace = useRef(false)

  const left = useMemo(() => makePanel(), [])
  const right = useMemo(() => makePanel(), [])
  const leftGeo = useMemo(() => new THREE.PlaneGeometry(1, 1, C - 1, R - 1), [])
  const rightGeo = useMemo(() => new THREE.PlaneGeometry(1, 1, C - 1, R - 1), [])
  const tex = useMemo(() => laceTexture(), [])
  const rodRef = useRef<THREE.Mesh>(null)
  const dotL = useRef<THREE.Mesh>(null)
  const dotR = useRef<THREE.Mesh>(null)

  useEffect(() => {
    let alive = true
    void createHandLandmarker(2).then((lm) => (alive ? (handLm.current = lm) : lm.close()))
    void createFaceLandmarker().then((lm) => (alive ? (faceLm.current = lm) : lm.close()))
    return () => {
      alive = false
      handLm.current?.close()
      faceLm.current?.close()
      handLm.current = faceLm.current = null
    }
  }, [])

  useFrame((_, delta) => {
    if (paused) return
    const now = performance.now()
    const vw = viewport.width
    const vh = viewport.height

    // ── detection ~30fps ──
    if (video.readyState >= 2 && video.videoWidth > 0 && now - lastDetect.current > 33) {
      const ts = now > lastDetect.current ? now : lastDetect.current + 1
      lastDetect.current = ts
      if (handLm.current) {
        const res = handLm.current.detectForVideo(video, ts)
        tips.current = res.landmarks.map((hand) => {
          const t = hand[INDEX_TIP]
          return { x: (1 - t.x - 0.5) * vw, y: (0.5 - t.y) * vh } // mirror to backdrop
        })
      }
      if (faceLm.current) {
        const fr = faceLm.current.detectForVideo(video, ts)
        const pts = fr.faceLandmarks[0]
        if (pts) {
          let minX = 1, minY = 1, maxX = 0, maxY = 0
          for (const p of pts) {
            if (p.x < minX) minX = p.x
            if (p.x > maxX) maxX = p.x
            if (p.y < minY) minY = p.y
            if (p.y > maxY) maxY = p.y
          }
          const cx = (1 - (minX + maxX) / 2 - 0.5) * vw
          const cy = (0.5 - (minY + maxY) / 2) * vh
          const w = (maxX - minX) * vw
          const h = (maxY - minY) * vh
          const f = face.current
          face.current = f
            ? { cx: f.cx + (cx - f.cx) * 0.3, cy: f.cy + (cy - f.cy) * 0.3, w: f.w + (w - f.w) * 0.2, h: f.h + (h - f.h) * 0.2 }
            : { cx, cy, w, h }
        }
      }
    }

    // ── curtain region, tight to the face ──
    const f = face.current
    const fcx = f ? f.cx : 0
    const fcy = f ? f.cy : 0
    const regionW = (f ? f.w * 2.3 : vw * 0.6)
    const regionH = (f ? f.h * 1.4 : vh * 0.45)
    const outerL = fcx - regionW / 2
    const outerR = fcx + regionW / 2
    const rodY = fcy + regionH * 0.5
    const centerX = fcx
    // closed panels overlap past the centre so the face is fully covered
    const ov = regionW * 0.12
    const closedL = centerX + ov
    const closedR = centerX - ov
    const restDXL = (closedL - outerL) / (C - 1)
    const restDXR = (outerR - closedR) / (C - 1)
    const restDY = regionH / (R - 1)

    // (re)build the panels once, and again the moment a face first appears so
    // they start hung over the face — not the default screen centre
    if (!inited.current || (f && !initedFace.current)) {
      innerL.current = closedL
      innerR.current = closedR
      initPanel(left, outerL, closedL, rodY, regionH)
      initPanel(right, outerR, closedR, rodY, regionH)
      inited.current = true
      if (f) initedFace.current = true
    }

    // ── parting: a finger left of centre drags the left half toward it, a
    // finger right of centre drags the right half. with no finger each half
    // eases back to its overlapped closed position (face covered by default).
    let tgtL = closedL
    let tgtR = closedR
    for (const t of tips.current) {
      if (t.y < rodY - regionH - 1 || t.y > rodY + 1) continue // off the drape
      if (t.x < centerX) tgtL = Math.min(tgtL, t.x)
      else tgtR = Math.max(tgtR, t.x)
    }
    tgtL = clamp(tgtL, outerL + restDXL, closedL)
    tgtR = clamp(tgtR, closedR, outerR - restDXR)
    const followL = tgtL < innerL.current ? 0.35 : 0.08 // open fast, close slower
    const followR = tgtR > innerR.current ? 0.35 : 0.08
    innerL.current += (tgtL - innerL.current) * followL
    innerR.current += (tgtR - innerR.current) * followR

    // pinned top rows along each half of the rod
    const pinXL: number[] = []
    const pinXR: number[] = []
    for (let c = 0; c < C; c++) {
      pinXL.push(outerL + (innerL.current - outerL) * (c / (C - 1)))
      pinXR.push(outerR + (innerR.current - outerR) * (c / (C - 1)))
    }
    const gatherL = (closedL - outerL) / Math.max(innerL.current - outerL, 0.3)
    const gatherR = (outerR - closedR) / Math.max(outerR - innerR.current, 0.3)
    const foldL = 0.12 + 0.08 * Math.min(gatherL, 4)
    const foldR = 0.12 + 0.08 * Math.min(gatherR, 4)

    // ── simulate ──
    const h = Math.min(delta || 1 / 60, 1 / 30)
    const t = now * 0.001
    step(left, pinXL, rodY, restDXL, restDY, t, 0.5, foldL, 0, h)
    step(right, pinXR, rodY, restDXR, restDY, t, 0.5, foldR, Math.PI, h)

    // NaN guard
    if (!Number.isFinite(left.pos[0]) || !Number.isFinite(right.pos[0])) {
      inited.current = false
      return
    }

    // ── push cloth into the geometry ──
    for (const [geo, p] of [[leftGeo, left], [rightGeo, right]] as const) {
      const attr = geo.attributes.position as THREE.BufferAttribute
      ;(attr.array as Float32Array).set(p.pos)
      attr.needsUpdate = true
      geo.computeVertexNormals()
    }

    // rod
    if (rodRef.current) {
      rodRef.current.position.set(centerX, rodY, 0.05)
      rodRef.current.scale.set(1, regionW * 1.08, 1)
    }
    // finger dots
    const t0 = tips.current[0]
    const t1 = tips.current[1]
    if (dotL.current) {
      dotL.current.visible = !!t0
      if (t0) dotL.current.position.set(t0.x, t0.y, 1.5)
    }
    if (dotR.current) {
      dotR.current.visible = !!t1
      if (t1) dotR.current.position.set(t1.x, t1.y, 1.5)
    }
  })

  return (
    <>
      <ambientLight intensity={1.15} />
      <directionalLight position={[-4, 5, 6]} intensity={1.25} />
      <mesh geometry={leftGeo}>
        <meshStandardMaterial map={tex} color="#f3efe6" roughness={0.95} metalness={0} side={THREE.DoubleSide} transparent alphaTest={0.2} />
      </mesh>
      <mesh geometry={rightGeo}>
        <meshStandardMaterial map={tex} color="#f3efe6" roughness={0.95} metalness={0} side={THREE.DoubleSide} transparent alphaTest={0.2} />
      </mesh>
      {/* curtain rod */}
      <mesh ref={rodRef} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.09, 0.09, 1, 12]} />
        <meshStandardMaterial color="#4a3b2c" roughness={0.6} metalness={0.3} />
      </mesh>
      {/* finger landmarks: plain white dots */}
      <mesh ref={dotL} visible={false}>
        <sphereGeometry args={[0.13, 16, 16]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh ref={dotR} visible={false}>
        <sphereGeometry args={[0.13, 16, 16]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </>
  )
}

function VideoBackdrop({ video }: { video: HTMLVideoElement }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (ref.current && video.srcObject) {
      ref.current.srcObject = video.srcObject
      void ref.current.play()
    }
  }, [video])
  return (
    <video
      ref={ref}
      playsInline
      muted
      className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
    />
  )
}

function Scene({ video, paused }: { video: HTMLVideoElement } & ExperimentProps) {
  return (
    <div className="relative h-full w-full">
      <VideoBackdrop video={video} />
      <Canvas
        orthographic
        camera={{ position: [0, 0, 10], zoom: 60 }}
        frameloop={paused ? 'never' : 'always'}
        dpr={[1, 1.5]}
        gl={{ preserveDrawingBuffer: true, alpha: true }}
        className="absolute inset-0"
      >
        <Curtains video={video} paused={paused} />
      </Canvas>
    </div>
  )
}

export default function LaceCurtain({ paused }: ExperimentProps) {
  return (
    <WebcamGate hint="a lace curtain hangs over your face — raise an index finger and drag a half open to peek through">
      {(video) => <Scene video={video} paused={paused} />}
    </WebcamGate>
  )
}

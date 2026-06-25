import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier'
import type { RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import type { HandLandmarker } from '@mediapipe/tasks-vision'
import type { ExperimentProps } from '@/shared/types'
import { WebcamGate } from '@/shared/components/WebcamGate'
import { createHandLandmarker } from '@/shared/lib/mediapipe'
import { GLASS_SCALE } from '@/shared/lib/glassAudio'
import { useGlassAudio } from '@/shared/hooks/useGlassAudio'
import { SoundToggle } from '@/shared/components/SoundToggle'

const MAX_HEARTS = 600
const THUMB_TIP = 4
const INDEX_TIP = 8

const HEARTS = ['❤️', '🧡', '💛', '💚', '💙', '💜', '🩷']

export interface HeartPinchSettings {
  size: number // heart size, world units
  gravity: number // fall speed
  burst: number // hearts per pinch
}

const DEFAULTS: HeartPinchSettings = { size: 0.7, gravity: 12, burst: 4 }

const textureCache = new Map<string, THREE.Texture>()

function heartTexture(emoji: string): THREE.Texture {
  const cached = textureCache.get(emoji)
  if (cached) return cached
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.font = `${size * 0.82}px 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(emoji, size / 2, size / 2)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  textureCache.set(emoji, tex)
  return tex
}

interface Heart {
  id: number
  emoji: string
  x: number
  y: number
  tilt: number
}

function HeartBody({ heart, size }: { heart: Heart; size: number }) {
  const body = useRef<RapierRigidBody>(null)
  const texture = useMemo(() => heartTexture(heart.emoji), [heart.emoji])

  useEffect(() => {
    const b = body.current
    if (!b) return
    b.setLinvel({ x: (Math.random() - 0.5) * 2.4, y: 0.5, z: 0 }, true)
    b.setAngvel({ x: 0, y: 0, z: (Math.random() - 0.5) * 8 }, true)
  }, [])

  return (
    <RigidBody
      ref={body}
      position={[heart.x, heart.y, 0]}
      rotation={[0, 0, heart.tilt]}
      enabledRotations={[false, false, true]}
      enabledTranslations={[true, true, false]}
      restitution={0.2}
      friction={0.5}
      linearDamping={0.04}
      angularDamping={0.1}
      gravityScale={0.78}
      colliders={false}
      ccd
    >
      <CuboidCollider args={[size * 0.4, size * 0.36, size]} />
      <sprite scale={[size, size, 1]}>
        <spriteMaterial map={texture} transparent depthWrite={false} />
      </sprite>
    </RigidBody>
  )
}

function Bounds() {
  const { viewport } = useThree()
  const w = viewport.width
  const h = viewport.height
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[w, 1, 4]} position={[0, -h / 2 - 1, 0]} />
      <CuboidCollider args={[1, h * 2, 4]} position={[-w / 2 - 1, 0, 0]} />
      <CuboidCollider args={[1, h * 2, 4]} position={[w / 2 + 1, 0, 0]} />
    </RigidBody>
  )
}

interface Tip {
  x: number
  y: number
  on: boolean
}

function Emitter({
  video,
  burst,
  paused,
  onHearts,
  hearts,
  tipsRef,
}: {
  video: HTMLVideoElement
  burst: number
  paused: boolean
  hearts: Heart[]
  onHearts: (h: Heart[]) => void
  tipsRef: React.MutableRefObject<Tip[]>
}) {
  const { viewport } = useThree()
  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const lastDetect = useRef(0)
  const nextId = useRef(0)
  // per-hand spawn timer so hearts stream while the gesture is held
  const lastSpawn = useRef<number[]>([0, 0])

  useEffect(() => {
    let alive = true
    void createHandLandmarker(2).then((lm) => {
      if (alive) landmarkerRef.current = lm
      else lm.close()
    })
    return () => {
      alive = false
      landmarkerRef.current?.close()
      landmarkerRef.current = null
    }
  }, [])

  useFrame(() => {
    if (paused) return
    const now = performance.now()
    const lm = landmarkerRef.current
    if (!lm || video.readyState < 2 || now - lastDetect.current < 83) return
    lastDetect.current = now

    const res = lm.detectForVideo(video, now)
    const fresh: Heart[] = []
    const tips: Tip[] = []

    res.landmarks.forEach((hand, h) => {
      if (h > 1) return
      const thumb = hand[THUMB_TIP]
      const index = hand[INDEX_TIP]
      // finger-heart: thumb tip and index tip cross/touch. tips close => gesture held.
      const dist = Math.hypot(thumb.x - index.x, thumb.y - index.y)
      const heart = dist < 0.08

      // landmark dots on both fingertips, mirrored to match the flipped backdrop
      for (const tip of [thumb, index]) {
        tips.push({
          x: (1 - tip.x - 0.5) * viewport.width,
          y: (0.5 - tip.y) * viewport.height,
          on: heart,
        })
      }

      // stream hearts every ~150ms while the gesture is held
      if (heart && now - lastSpawn.current[h] > 150) {
        lastSpawn.current[h] = now
        // spawn at the crossing point, mirrored to match the flipped backdrop
        const mx = (thumb.x + index.x) / 2
        const my = (thumb.y + index.y) / 2
        const wx = (1 - mx - 0.5) * viewport.width
        const wy = (0.5 - my) * viewport.height
        for (let i = 0; i < burst; i++) {
          fresh.push({
            id: nextId.current++,
            emoji: HEARTS[Math.floor(Math.random() * HEARTS.length)],
            x: wx + (Math.random() - 0.5) * 0.4,
            y: wy + (Math.random() - 0.5) * 0.4,
            tilt: (Math.random() - 0.5) * 0.9,
          })
        }
      }
    })

    tipsRef.current = tips
    if (fresh.length) onHearts([...hearts, ...fresh].slice(-MAX_HEARTS))
  })

  return null
}

// up to 4 fingertip dots (2 hands × thumb + index), driven by tipsRef each frame
function Dots({ tipsRef }: { tipsRef: React.MutableRefObject<Tip[]> }) {
  const group = useRef<THREE.Group>(null)
  useFrame(() => {
    const g = group.current
    if (!g) return
    const tips = tipsRef.current
    g.children.forEach((dot, i) => {
      const tip = tips[i]
      dot.visible = !!tip
      if (!tip) return
      dot.position.set(tip.x, tip.y, 1)
    })
  })
  return (
    <group ref={group}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} visible={false}>
          <circleGeometry args={[0.08, 24]} />
          <meshBasicMaterial color="#7fffd4" transparent opacity={0.85} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

function Scene({ video, paused }: { video: HTMLVideoElement } & ExperimentProps) {
  const [hearts, setHearts] = useState<Heart[]>([])
  const [settings, setSettings] = useState<HeartPinchSettings>(DEFAULTS)
  const [panelOpen, setPanelOpen] = useState(false)
  const { audioRef, muted, toggleMuted } = useGlassAudio(paused, 0.8)
  const lastSeenId = useRef(-1)
  const tipsRef = useRef<Tip[]>([])

  // a soft glass chime on each pinch burst
  const handleHearts = (next: Heart[]) => {
    let chimed = false
    for (const h of next) {
      if (h.id > lastSeenId.current) {
        lastSeenId.current = h.id
        if (!chimed) {
          chimed = true
          audioRef.current?.bell(GLASS_SCALE[2 + Math.floor(Math.random() * 4)], {
            bright: 0.9,
            dur: 0.9,
            gain: 0.2,
            pan: Math.max(-1, Math.min(1, h.x / 5)),
          })
        }
      }
    }
    setHearts(next)
  }

  return (
    <div className="relative h-full w-full">
      <VideoBackdrop video={video} />
      <Canvas
        orthographic
        camera={{ position: [0, 0, 10], zoom: 60 }}
        frameloop={paused ? 'never' : 'always'}
        dpr={[1, 1.5]}
        gl={{ preserveDrawingBuffer: true }}
        className="absolute inset-0"
      >
        <Physics paused={paused} gravity={[0, -settings.gravity, 0]}>
          <Bounds />
          <Emitter
            video={video}
            burst={settings.burst}
            paused={paused}
            hearts={hearts}
            onHearts={handleHearts}
            tipsRef={tipsRef}
          />
          <Dots tipsRef={tipsRef} />
          {hearts.map((h) => (
            <HeartBody key={h.id} heart={h} size={settings.size} />
          ))}
        </Physics>
      </Canvas>
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
        {panelOpen && (
          <div className="w-72 space-y-2 border border-lab-line bg-black/70 p-3 backdrop-blur">
            {(
              [
                { key: 'size', label: 'heart size', min: 0.2, max: 1.6, step: 0.05 },
                { key: 'gravity', label: 'fall speed', min: 2, max: 36, step: 1 },
                { key: 'burst', label: 'stream', min: 1, max: 12, step: 1 },
              ] as const
            ).map((s) => (
              <label key={s.key} className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-white/50">
                <span className="w-20 shrink-0">{s.label}</span>
                <input
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={settings[s.key]}
                  onChange={(e) =>
                    setSettings({ ...settings, [s.key]: Number(e.target.value) })
                  }
                  className="h-px w-full cursor-pointer appearance-none bg-white/30 accent-lab-green"
                />
                <span className="w-8 text-right tabular-nums text-white/70">
                  {settings[s.key]}
                </span>
              </label>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 border border-lab-line bg-black/50 py-1 pl-3 pr-1 backdrop-blur">
          <span className="text-[10px] uppercase tracking-widest text-white/50">
            make a finger heart
          </span>
          <button
            onClick={() => setHearts([])}
            className="px-2 py-1 text-xs text-white/50 hover:text-white"
          >
            [clear]
          </button>
          <button
            onClick={() => setPanelOpen((o) => !o)}
            className={`px-2 py-1 text-xs ${panelOpen ? 'text-lab-green' : 'text-white/50 hover:text-white'}`}
          >
            [⚙]
          </button>
        </div>
      </div>
      <SoundToggle muted={muted} onToggle={toggleMuted} />
    </div>
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
      className="absolute inset-0 h-full w-full -scale-x-100 object-cover contrast-105"
    />
  )
}

export default function HeartPinch({ paused }: ExperimentProps) {
  return (
    <WebcamGate hint="make a finger heart — cross your thumb and index fingertips and hearts pour out of the crossing point and pile up under physics">
      {(video) => <Scene video={video} paused={paused} />}
    </WebcamGate>
  )
}

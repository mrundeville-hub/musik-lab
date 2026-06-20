import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier'
import type { RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import type { FaceLandmarker } from '@mediapipe/tasks-vision'
import type { ExperimentProps } from '@/shared/types'
import { WebcamGate } from '@/shared/components/WebcamGate'
import { createFaceLandmarker } from '@/shared/lib/mediapipe'
import { GLASS_SCALE } from '@/shared/lib/glassAudio'
import { useGlassAudio } from '@/shared/hooks/useGlassAudio'
import { SoundToggle } from '@/shared/components/SoundToggle'

const MAX_LETTERS = 600

export interface EyeTypeSettings {
  size: number // letter size, world units
  gravity: number // fall speed
  rate: number // letters per second per eye
}

const DEFAULTS: EyeTypeSettings = { size: 0.6, gravity: 14, rate: 8 }
// outer-corner landmark pairs per eye
const LEFT_EYE = [33, 145]
const RIGHT_EYE = [263, 374]

const textureCache = new Map<string, THREE.Texture>()

function letterTexture(char: string): THREE.Texture {
  const cached = textureCache.get(char)
  if (cached) return cached
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.font = `500 ${size * 0.8}px 'Helvetica Neue', Helvetica, Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(8,8,8,0.86)'
  ctx.lineWidth = size * 0.05
  ctx.strokeText(char, size / 2, size / 2)
  ctx.fillStyle = '#f5f5f0'
  ctx.fillText(char, size / 2, size / 2)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  textureCache.set(char, tex)
  return tex
}

interface Letter {
  id: number
  char: string
  x: number
  y: number
  tilt: number
}

function LetterBody({ letter, size }: { letter: Letter; size: number }) {
  const body = useRef<RapierRigidBody>(null)
  const texture = useMemo(() => letterTexture(letter.char), [letter.char])

  useEffect(() => {
    const b = body.current
    if (!b) return
    b.setLinvel({ x: (Math.random() - 0.5) * 2.2, y: 0, z: 0 }, true)
    b.setAngvel({ x: 0, y: 0, z: (Math.random() - 0.5) * 10 }, true)
  }, [])

  return (
    <RigidBody
      ref={body}
      position={[letter.x, letter.y, 0]}
      rotation={[0, 0, letter.tilt]}
      enabledRotations={[false, false, true]}
      enabledTranslations={[true, true, false]}
      restitution={0.14}
      friction={0.42}
      linearDamping={0.02}
      angularDamping={0.08}
      gravityScale={0.78}
      colliders={false}
      ccd
    >
      <CuboidCollider args={[size * 0.34, size * 0.36, size]} />
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

function Emitter({
  video,
  word,
  rate,
  paused,
  onLetters,
  letters,
}: {
  video: HTMLVideoElement
  word: string
  rate: number
  paused: boolean
  letters: Letter[]
  onLetters: (l: Letter[]) => void
}) {
  const { viewport } = useThree()
  const landmarkerRef = useRef<FaceLandmarker | null>(null)
  const anchors = useRef<{ x: number; y: number }[]>([])
  const lastDetect = useRef(0)
  const lastSpawn = useRef(0)
  const charIndex = useRef(0)
  const nextId = useRef(0)

  useEffect(() => {
    let alive = true
    void createFaceLandmarker().then((lm) => {
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

    // ~12fps tracking is enough for stable anchors
    if (lm && video.readyState >= 2 && now - lastDetect.current > 83) {
      lastDetect.current = now
      const res = lm.detectForVideo(video, now)
      const face = res.faceLandmarks[0]
      if (face) {
        // average landmark pair per eye; mirror x to match the mirrored backdrop
        anchors.current = [LEFT_EYE, RIGHT_EYE].map((pair) => {
          const x = pair.reduce((s, i) => s + face[i].x, 0) / pair.length
          const y = pair.reduce((s, i) => s + face[i].y, 0) / pair.length
          return {
            x: (1 - x - 0.5) * viewport.width,
            y: (0.5 - y) * viewport.height,
          }
        })
      } else {
        anchors.current = []
      }
    }

    if (anchors.current.length && now - lastSpawn.current > 1000 / rate) {
      lastSpawn.current = now
      const fresh: Letter[] = anchors.current.map((a) => {
        const char = word[charIndex.current++ % word.length] ?? '?'
        return {
          id: nextId.current++,
          char: char.toUpperCase(),
          x: a.x,
          y: a.y,
          tilt: (Math.random() - 0.5) * 0.9,
        }
      })
      onLetters([...letters, ...fresh].slice(-MAX_LETTERS))
    }
  })

  return null
}

function Scene({ video, paused }: { video: HTMLVideoElement } & ExperimentProps) {
  const [word, setWord] = useState('TYPE')
  const [letters, setLetters] = useState<Letter[]>([])
  const [settings, setSettings] = useState<EyeTypeSettings>(DEFAULTS)
  const [panelOpen, setPanelOpen] = useState(false)
  const { audioRef, muted, toggleMuted } = useGlassAudio(paused, 0.8)
  const lastSeenId = useRef(-1)

  // a tiny glass tick per spawned letter, panned by emitter position
  const handleLetters = (next: Letter[]) => {
    for (const l of next) {
      if (l.id > lastSeenId.current) {
        lastSeenId.current = l.id
        audioRef.current?.bell(GLASS_SCALE[3 + Math.floor(Math.random() * 3)], {
          bright: 0.95,
          dur: 0.7,
          gain: 0.18,
          pan: Math.max(-1, Math.min(1, l.x / 5)),
        })
      }
    }
    setLetters(next)
  }

  return (
    <div className="relative h-full w-full">
      {/* mirrored webcam backdrop */}
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
            word={word || 'TYPE'}
            rate={settings.rate}
            paused={paused}
            letters={letters}
            onLetters={handleLetters}
          />
          {letters.map((l) => (
            <LetterBody key={l.id} letter={l} size={settings.size} />
          ))}
        </Physics>
      </Canvas>
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
        {panelOpen && (
          <div className="w-72 space-y-2 border border-lab-line bg-black/70 p-3 backdrop-blur">
            {(
              [
                { key: 'size', label: 'letter size', min: 0.2, max: 1.6, step: 0.05 },
                { key: 'gravity', label: 'fall speed', min: 2, max: 36, step: 1 },
                { key: 'rate', label: 'spawn rate', min: 1, max: 24, step: 1 },
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
          <label className="text-[10px] uppercase tracking-widest text-white/50">
            word
          </label>
          <input
            value={word}
            maxLength={24}
            onChange={(e) => {
              setWord(e.target.value)
              setLetters([])
            }}
            className="w-32 bg-white/10 px-2 py-1 text-center text-xs uppercase tracking-widest text-white outline-none focus:bg-white/15"
          />
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

export default function EyeType({ paused }: ExperimentProps) {
  return (
    <WebcamGate hint="face tracking finds your eyes — letters pour out of them and pile up under physics">
      {(video) => <Scene video={video} paused={paused} />}
    </WebcamGate>
  )
}

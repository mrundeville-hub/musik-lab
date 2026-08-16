import { useEffect, useRef } from 'react'
import type { FaceLandmarker, HandLandmarker } from '@mediapipe/tasks-vision'
import { WebcamGate } from '@/shared/components/WebcamGate'
import { SoundToggle } from '@/shared/components/SoundToggle'
import type { ExperimentProps } from '@/shared/types'
import { useAnimationLoop } from '@/shared/hooks/useAnimationLoop'
import { useCanvas2D } from '@/shared/hooks/useCanvas2D'
import { useGlassAudio } from '@/shared/hooks/useGlassAudio'
import { GLASS_SCALE } from '@/shared/lib/glassAudio'
import { createFaceLandmarker, createHandLandmarker } from '@/shared/lib/mediapipe'
import { dist, mirroredPoint, type Point } from '../_shared/asciiTools'

const DETECT_MS = 33
const PINCH_ON = 42
const PINCH_OFF = 60
const MAX_SNOW = 900

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function Scene({ video, paused }: { video: HTMLVideoElement } & ExperimentProps) {
  const { canvasRef, ctxRef, sizeRef } = useCanvas2D()
  const videoRef = useRef<HTMLVideoElement>(null)
  const handRef = useRef<HandLandmarker | null>(null)
  const faceRef = useRef<FaceLandmarker | null>(null)
  const lastDetect = useRef(0)
  const offscreen = useRef<HTMLCanvasElement | null>(null)

  const pinchRef = useRef<{ on: boolean; gap: number }[]>([
    { on: false, gap: 80 },
    { on: false, gap: 80 },
  ])
  const palmCover = useRef(0)
  const mouthOpen = useRef(0)
  const roll = useRef(0) // residual roll offset px
  const rollVel = useRef(0)
  const tear = useRef(0)
  const snow = useRef<{ x: number; y: number; s: number }[]>([])
  const phase = useRef(0)

  const { audioRef, muted, toggleMuted } = useGlassAudio(paused, 0.22)

  useEffect(() => {
    const el = videoRef.current
    if (el) {
      el.srcObject = video.srcObject
      void el.play().catch(() => {})
    }
  }, [video])

  useEffect(() => {
    let alive = true
    void Promise.all([createHandLandmarker(2), createFaceLandmarker()]).then(([hand, face]) => {
      if (alive) {
        handRef.current = hand
        faceRef.current = face
      } else {
        hand.close()
        face.close()
      }
    })
    return () => {
      alive = false
      handRef.current?.close()
      faceRef.current?.close()
      handRef.current = null
      faceRef.current = null
    }
  }, [])

  useAnimationLoop((_elapsed, delta) => {
    const ctx = ctxRef.current
    if (!ctx) return
    const { width, height } = sizeRef.current
    if (!width || !height) return
    const now = performance.now()
    const audio = audioRef.current
    const dt = Math.min(delta, 0.05)
    phase.current += dt

    if (video.readyState >= 2 && video.videoWidth > 0 && now - lastDetect.current > DETECT_MS) {
      const ts = now > lastDetect.current ? now : lastDetect.current + 1
      lastDetect.current = ts
      const hand = handRef.current
      let cover = 0
      if (hand) {
        const res = hand.detectForVideo(video, ts)
        const gaps: { mid: Point; gap: number; area: number }[] = []
        for (const l of res.landmarks) {
          const thumb = mirroredPoint(l[4], width, height)
          const index = mirroredPoint(l[8], width, height)
          const wrist = mirroredPoint(l[0], width, height)
          const mid = { x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 }
          const gap = dist(thumb, index)
          // palm size heuristic — large landmark spread ≈ close to camera
          const pinky = mirroredPoint(l[20], width, height)
          const area = dist(wrist, pinky) * dist(mirroredPoint(l[5], width, height), mirroredPoint(l[17], width, height))
          gaps.push({ mid, gap, area })
          cover = Math.max(cover, clamp((area - 90000) / 180000, 0, 1))
        }
        for (let i = 0; i < 2; i++) {
          const g = gaps[i]
          const p = pinchRef.current[i]
          if (!g) {
            if (p.on) {
              // snap release even if hand lost while pinched
              p.on = false
              rollVel.current += (Math.random() > 0.5 ? 1 : -1) * (420 + Math.random() * 280)
              audio?.bell(GLASS_SCALE[2], { bright: 0.7, dur: 0.5, gain: 0.4 })
            }
            continue
          }
          if (!p.on && g.gap < PINCH_ON) p.on = true
          else if (p.on && g.gap > PINCH_OFF) {
            p.on = false
            rollVel.current += (g.mid.x < width / 2 ? -1 : 1) * (480 + Math.random() * 320)
            audio?.bell(GLASS_SCALE[3], { bright: 0.85, dur: 0.45, gain: 0.5 })
            audio?.sparkle(clamp((g.mid.x / width) * 2 - 1, -1, 1))
          }
          p.gap = g.gap
        }
      }
      palmCover.current = lerp(palmCover.current, cover, 0.2)

      const face = faceRef.current?.detectForVideo(video, ts).faceLandmarks[0]
      if (face) {
        const mouthW = Math.hypot(face[291].x - face[61].x, face[291].y - face[61].y) || 1e-6
        const mouthH = Math.hypot(face[14].x - face[13].x, face[14].y - face[13].y)
        mouthOpen.current = lerp(mouthOpen.current, clamp((mouthH / mouthW - 0.18) / 0.4, 0, 1), 0.25)
      } else {
        mouthOpen.current = lerp(mouthOpen.current, 0, 0.15)
      }
    }

    // physics
    roll.current += rollVel.current * dt
    rollVel.current *= Math.exp(-dt * 2.4)
    roll.current *= Math.exp(-dt * 0.35)
    if (Math.abs(roll.current) > height * 4) roll.current = 0
    tear.current = lerp(tear.current, mouthOpen.current, 0.15)

    // snow particles when covered
    const cover = palmCover.current
    if (cover > 0.25 && snow.current.length < MAX_SNOW) {
      const n = Math.floor(cover * 40)
      for (let i = 0; i < n; i++) {
        snow.current.push({
          x: Math.random() * width,
          y: Math.random() * height,
          s: 1 + Math.random() * 2.5,
        })
      }
    }
    if (cover < 0.1) snow.current.length = Math.max(0, snow.current.length - 40)
    else if (snow.current.length > MAX_SNOW) snow.current.length = MAX_SNOW

    // offscreen mirrored webcam
    let off = offscreen.current
    if (!off) {
      off = document.createElement('canvas')
      offscreen.current = off
    }
    if (off.width !== width || off.height !== height) {
      off.width = width
      off.height = height
    }
    const octx = off.getContext('2d')
    if (octx && video.readyState >= 2) {
      octx.save()
      octx.translate(width, 0)
      octx.scale(-1, 1)
      octx.drawImage(video, 0, 0, width, height)
      octx.restore()
    }

    // CRT barrel-ish: slight inset scale + dark edges later
    ctx.fillStyle = '#050508'
    ctx.fillRect(0, 0, width, height)

    const scale = 1.04
    const ox = ((scale - 1) * width) / 2
    const oy = ((scale - 1) * height) / 2
    const yOff = roll.current % height

    ctx.save()
    ctx.beginPath()
    ctx.roundRect(8, 8, width - 16, height - 16, 18)
    ctx.clip()

    // draw rolled picture (two tiles for wrap)
    if (off) {
      ctx.drawImage(off, -ox, -oy + yOff, width * scale, height * scale)
      ctx.drawImage(off, -ox, -oy + yOff - height * scale, width * scale, height * scale)
      if (yOff < 0) ctx.drawImage(off, -ox, -oy + yOff + height * scale, width * scale, height * scale)
    }

    // tracking tears
    if (tear.current > 0.2) {
      const bands = 3 + Math.floor(tear.current * 5)
      for (let i = 0; i < bands; i++) {
        const by = ((phase.current * 80 + i * 47) % height)
        const bh = 4 + tear.current * 14
        const shift = Math.sin(phase.current * 9 + i) * tear.current * 28
        if (off) {
          ctx.drawImage(off, 0, by, width, bh, shift, by, width, bh)
        }
        ctx.fillStyle = `rgba(255,255,255,${0.04 + tear.current * 0.08})`
        ctx.fillRect(0, by, width, 1)
      }
    }

    // scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.22)'
    for (let y = 0; y < height; y += 3) {
      ctx.fillRect(0, y, width, 1)
    }

    // phosphor bloom vignette
    const grd = ctx.createRadialGradient(width / 2, height / 2, height * 0.2, width / 2, height / 2, height * 0.75)
    grd.addColorStop(0, 'rgba(0,0,0,0)')
    grd.addColorStop(1, 'rgba(0,0,0,0.55)')
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, width, height)

    // green/amber CRT tint
    ctx.globalCompositeOperation = 'screen'
    ctx.fillStyle = 'rgba(40, 180, 90, 0.06)'
    ctx.fillRect(0, 0, width, height)
    ctx.globalCompositeOperation = 'source-over'

    // snow overlay
    if (cover > 0.15 || snow.current.length) {
      ctx.globalAlpha = 0.15 + cover * 0.7
      ctx.fillStyle = '#c8c8c8'
      for (const s of snow.current) {
        s.x += (Math.random() - 0.5) * 8
        s.y += (Math.random() - 0.5) * 8
        ctx.fillRect(s.x, s.y, s.s, s.s)
      }
      ctx.globalAlpha = 1
      if (cover > 0.4 && Math.random() < 0.08) audio?.sparkle((Math.random() * 2 - 1))
    }

    ctx.restore()

    // bezel
    ctx.strokeStyle = 'rgba(180,190,200,0.25)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.roundRect(6, 6, width - 12, height - 12, 20)
    ctx.stroke()

    audio?.setPadBrightness(0.1 + cover * 0.4 + Math.min(1, Math.abs(rollVel.current) / 800) * 0.3)

    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.fillStyle = 'rgba(160,255,180,0.55)'
    ctx.fillText(
      cover > 0.4
        ? 'NO SIGNAL — pull palm away'
        : tear.current > 0.35
          ? 'TRACKING… close mouth'
          : 'snap fingers (pinch-release) · palm = snow · mouth = tears',
      18,
      height - 18,
    )
  }, paused)

  return (
    <div className="relative size-full overflow-hidden bg-black" onPointerDown={() => audioRef.current?.resume()}>
      <video ref={videoRef} playsInline muted className="hidden" />
      <canvas ref={canvasRef} className="absolute inset-0 size-full touch-none" />
      <div className="absolute right-3 top-3">
        <SoundToggle muted={muted} onToggle={toggleMuted} />
      </div>
    </div>
  )
}

export default function CrtSnow({ paused }: ExperimentProps) {
  return (
    <WebcamGate hint="snap your fingers to roll the CRT — palm covers for snow">
      {(video) => <Scene video={video} paused={paused} />}
    </WebcamGate>
  )
}

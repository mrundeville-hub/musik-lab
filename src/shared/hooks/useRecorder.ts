import { useCallback, useEffect, useRef, useState } from 'react'

import { getCaptureAudioTracks } from '@/shared/lib/audioCapture'

function pickMimeType() {
  // prefer webm/opus: Chrome's MediaRecorder reliably muxes an externally
  // added audio track here, whereas video/mp4 often drops it (silent file).
  // mp4 stays as a last resort for browsers without webm.
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
  ]
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
}

// resolve the effective x/y scale of an element, covering both the CSS `scale`
// property (Tailwind v4) and a legacy `transform: matrix(...)`.
function readScale(style: CSSStyleDeclaration) {
  // CSS `scale` property: "none" | "<x>" | "<x> <y>" | "<x> <y> <z>"
  const s = style.scale
  if (s && s !== 'none') {
    const parts = s.split(/\s+/).map(Number)
    const x = Number.isFinite(parts[0]) ? parts[0] : 1
    const y = parts.length > 1 && Number.isFinite(parts[1]) ? parts[1] : x
    return { x, y }
  }
  // transform matrix: matrix(a, b, c, d, e, f) -> a = scaleX, d = scaleY
  const m = style.transform
  if (m && m.startsWith('matrix(')) {
    const n = m.slice(7, -1).split(',').map(Number)
    if (n.length >= 4) return { x: n[0], y: n[3] }
  }
  return { x: 1, y: 1 }
}

// intrinsic pixel size of a video/canvas source, used for object-fit: cover crop math
function sourceSize(el: HTMLVideoElement | HTMLCanvasElement) {
  if (el instanceof HTMLVideoElement) {
    return { w: el.videoWidth, h: el.videoHeight }
  }
  return { w: el.width, h: el.height }
}

export function useRecorder(filename: string) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const rafRef = useRef(0)
  const timerRef = useRef(0)
  const elapsedRef = useRef(0)

  const stop = useCallback(() => {
    recorderRef.current?.stop()
    recorderRef.current = null
    cancelAnimationFrame(rafRef.current)
    clearInterval(timerRef.current)
    elapsedRef.current = 0
    setRecording(false)
    setSeconds(0)
  }, [])

  const start = useCallback(
    (stage: HTMLElement) => {
      const rect = stage.getBoundingClientRect()
      // capture at the real on-screen resolution (CSS px × device pixel ratio)
      const dpr = window.devicePixelRatio || 1
      const target = document.createElement('canvas')
      target.width = Math.round(rect.width * dpr)
      target.height = Math.round(rect.height * dpr)
      const ctx = target.getContext('2d')
      if (!ctx) return
      // work in CSS-pixel coordinates; dpr scales everything up to native resolution
      ctx.scale(dpr, dpr)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'

      const draw = () => {
        ctx.fillStyle = '#0a0a0b'
        ctx.fillRect(0, 0, rect.width, rect.height)

        const layers = stage.querySelectorAll<HTMLVideoElement | HTMLCanvasElement>('video, canvas')
        for (const el of layers) {
          if (el instanceof HTMLVideoElement && (el.readyState < 2 || el.hidden)) continue
          const style = getComputedStyle(el)
          if (style.display === 'none' || style.visibility === 'hidden') continue

          const box = el.getBoundingClientRect()
          const x = box.left - rect.left
          const y = box.top - rect.top

          // Tailwind v4 emits the CSS `scale` property (e.g. "-1 1"), not a transform
          // matrix — so read both. negative x-scale => horizontally mirrored, like the screen.
          // (any zoom from `scale` is already reflected in box via getBoundingClientRect,
          // so we only need the mirror flip here, not extra cropping.)
          const mirrored = readScale(style).x < 0

          // honor object-fit: cover so the recording is framed exactly like the screen
          const src = sourceSize(el)
          let sx = 0
          let sy = 0
          let sw = src.w
          let sh = src.h
          if (style.objectFit === 'cover' && src.w > 0 && src.h > 0) {
            const cover = Math.max(box.width / src.w, box.height / src.h)
            sw = box.width / cover
            sh = box.height / cover
            sx = (src.w - sw) / 2
            sy = (src.h - sh) / 2
          }

          ctx.save()
          ctx.globalAlpha = Number.parseFloat(style.opacity) || 1
          if (mirrored) {
            ctx.translate(x + box.width, y)
            ctx.scale(-1, 1)
            ctx.drawImage(el, sx, sy, sw, sh, 0, 0, box.width, box.height)
          } else {
            ctx.drawImage(el, sx, sy, sw, sh, x, y, box.width, box.height)
          }
          ctx.restore()
        }

        rafRef.current = requestAnimationFrame(draw)
      }

      rafRef.current = requestAnimationFrame(draw)
      const stream = target.captureStream(60)
      // mix the experiment's live audio into the recording
      const audioTracks = getCaptureAudioTracks()
      for (const track of audioTracks) stream.addTrack(track)
      if (!audioTracks.length) {
        console.warn('[useRecorder] no audio track registered — recording will be silent')
      }
      const mimeType = pickMimeType()
      const recorder = new MediaRecorder(stream, {
        mimeType: mimeType || undefined,
        videoBitsPerSecond: 16_000_000,
      })
      const chunks: Blob[] = []

      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        if (!chunks.length) {
          console.warn('[useRecorder] no data captured — nothing to download')
          return
        }
        const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'
        const blob = new Blob(chunks, { type: mimeType || 'video/webm' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${filename}-${Math.round(performance.timeOrigin + performance.now())}.${ext}`
        // anchor must be in the DOM for the click to trigger a download in some browsers
        document.body.appendChild(a)
        a.click()
        a.remove()
        // revoke after the download has had a chance to start
        setTimeout(() => URL.revokeObjectURL(url), 10_000)
      }

      recorder.start(250)
      recorderRef.current = recorder
      setRecording(true)
      setSeconds(0)
      elapsedRef.current = 0
      timerRef.current = window.setInterval(() => {
        elapsedRef.current += 1
        setSeconds(elapsedRef.current)
      }, 1000)
    },
    [filename],
  )

  useEffect(() => stop, [stop])

  return { recording, seconds, start, stop }
}

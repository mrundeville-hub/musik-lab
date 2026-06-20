import { useCallback, useEffect, useRef, useState } from 'react'

export type WebcamState = 'idle' | 'requesting' | 'active' | 'denied' | 'error'

/**
 * Webcam access with explicit permission flow and guaranteed cleanup.
 * Call `start()` from a user gesture; the stream is stopped on unmount.
 */
export function useWebcam(constraints: MediaTrackConstraints = {}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [state, setState] = useState<WebcamState>('idle')

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setState('idle')
  }, [])

  const start = useCallback(async () => {
    setState('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', ...constraints },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setState('active')
    } catch (err) {
      setState(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'denied'
          : 'error',
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => stop, [stop])

  return { videoRef, state, start, stop }
}

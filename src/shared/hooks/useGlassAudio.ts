import { useEffect, useRef, useState } from 'react'
import { GlassAudio } from '@/shared/lib/glassAudio'

/**
 * Owns a GlassAudio instance for an experiment: creates it on mount
 * (webcam-gate click already satisfied the gesture requirement),
 * mutes while paused, disposes on unmount.
 */
export function useGlassAudio(paused: boolean, padLevel = 1) {
  const audioRef = useRef<GlassAudio | null>(null)
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    const audio = new GlassAudio()
    audio.setPadLevel(padLevel)
    audio.resume()
    audioRef.current = audio
    return () => {
      audio.dispose()
      audioRef.current = null
    }
    // padLevel is an init-only knob
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    audioRef.current?.setMuted(muted || paused)
  }, [muted, paused])

  const toggleMuted = () => {
    audioRef.current?.resume()
    setMuted((m) => !m)
  }

  return { audioRef, muted, toggleMuted }
}

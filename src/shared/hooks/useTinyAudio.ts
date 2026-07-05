import { useEffect, useRef, useState } from 'react'

import { TinyAudio } from '@/experiments/_shared/asciiTools'

/** Owns a TinyAudio instance: registers capture on mount, mutes while paused. */
export function useTinyAudio(paused: boolean) {
  const audioRef = useRef(new TinyAudio())
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    audioRef.current.resume()
    return () => {
      audioRef.current.dispose()
    }
  }, [])

  useEffect(() => {
    audioRef.current.setMuted(muted || paused)
  }, [muted, paused])

  const toggleMuted = () => {
    audioRef.current.resume()
    setMuted((m) => !m)
  }

  return { audioRef, muted, toggleMuted }
}

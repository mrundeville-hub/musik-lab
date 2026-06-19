import { useRef, useState } from 'react'
import { useAnimationLoop } from '@/shared/hooks/useAnimationLoop'

export function FpsMeter({ paused }: { paused: boolean }) {
  const [fps, setFps] = useState(0)
  const acc = useRef({ frames: 0, time: 0 })

  useAnimationLoop((_, delta) => {
    acc.current.frames += 1
    acc.current.time += delta
    if (acc.current.time >= 0.5) {
      setFps(Math.round(acc.current.frames / acc.current.time))
      acc.current = { frames: 0, time: 0 }
    }
  }, paused)

  return (
    <span className="text-[11px] tabular-nums text-ink-dim">
      fps:{paused ? '--' : String(fps).padStart(3, ' ')}
    </span>
  )
}

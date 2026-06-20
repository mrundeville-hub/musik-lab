import { useEffect, useRef } from 'react'

/** Hard cap so 120 Hz / ProMotion displays don't render (and heat) at 2x. */
const FPS_CAP = 60
const MIN_FRAME_MS = 1000 / FPS_CAP - 1 // small slack to avoid dropping to 30

/**
 * requestAnimationFrame loop with pause support and automatic cleanup.
 * `callback` receives elapsed time (s) and delta since last frame (s).
 * Elapsed time does not advance while paused, so animations freeze cleanly.
 * Frames are throttled to ~60 FPS regardless of display refresh rate.
 */
export function useAnimationLoop(
  callback: (elapsed: number, delta: number) => void,
  paused = false,
) {
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  })

  useEffect(() => {
    if (paused) return
    let frame = 0
    let last = performance.now()
    let lastRender = last
    let elapsed = 0
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      // skip this frame on high-refresh displays until ~16.6ms have passed
      if (now - lastRender < MIN_FRAME_MS) return
      lastRender = now
      const delta = Math.min((now - last) / 1000, 0.1)
      last = now
      elapsed += delta
      callbackRef.current(elapsed, delta)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [paused])
}

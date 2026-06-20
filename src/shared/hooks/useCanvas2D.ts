import { useEffect, useRef } from 'react'

export interface CanvasSize {
  width: number
  height: number
  dpr: number
}

/**
 * Manages a 2D canvas that fills its parent: handles devicePixelRatio,
 * resize via ResizeObserver, and exposes the context + CSS-pixel size.
 */
export function useCanvas2D() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const sizeRef = useRef<CanvasSize>({ width: 0, height: 0, dpr: 1 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    ctxRef.current = canvas.getContext('2d')

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const { clientWidth, clientHeight } = canvas
      canvas.width = Math.round(clientWidth * dpr)
      canvas.height = Math.round(clientHeight * dpr)
      sizeRef.current = { width: clientWidth, height: clientHeight, dpr }
      ctxRef.current?.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()
    return () => observer.disconnect()
  }, [])

  return { canvasRef, ctxRef, sizeRef }
}

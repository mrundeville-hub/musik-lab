import { useCallback, useState, type ReactNode } from 'react'
import { useWebcam } from '@/shared/hooks/useWebcam'

/**
 * Permission flow for webcam experiments: explicit start button (user
 * gesture), graceful denied/error fallbacks, hidden <video> element.
 * Children render only once the stream is live.
 */
export function WebcamGate({
  hint,
  children,
}: {
  hint: string
  children: (video: HTMLVideoElement) => ReactNode
}) {
  const { videoRef, state, start } = useWebcam()
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null)

  const attachVideo = useCallback(
    (el: HTMLVideoElement | null) => {
      videoRef.current = el
      setVideoEl(el)
    },
    [videoRef],
  )

  return (
    <div className="relative h-full w-full">
      <video ref={attachVideo} playsInline muted className="hidden" />

      {state === 'active' && videoEl && children(videoEl)}

      {state !== 'active' && (
        <div className="grid h-full place-items-center bg-[#1c1b1f] px-6 text-center font-ui text-white/85">
          <div className="win-shadow w-[min(90%,340px)] overflow-hidden rounded-[10px] border border-black/40 bg-win-body text-ink2">
            <div className="metal flex h-8 items-center border-b border-black/15 px-3 text-[12px] font-semibold">
              Camera
            </div>
            <div className="flex flex-col items-center gap-4 p-6">
              {state === 'idle' && (
                <>
                  <div className="halftone size-14 rounded-md border border-black/20 bg-white/70" />
                  <p className="text-[13px] leading-relaxed text-ink2">{hint}</p>
                  <button onClick={() => void start()} className="lozenge" data-active>
                    Enable camera
                  </button>
                  <p className="text-[11px] text-ink-dim">Video stays on this device.</p>
                </>
              )}
              {state === 'requesting' && <p className="text-[13px] text-ink2">Requesting camera…</p>}
              {(state === 'denied' || state === 'error') && (
                <>
                  <p className="text-[13px] font-semibold text-red-600">
                    {state === 'denied' ? 'Camera access denied' : 'Camera unavailable'}
                  </p>
                  <p className="text-[12px] leading-relaxed text-ink-dim">
                    This experiment needs a webcam. Check browser permissions and try again.
                  </p>
                  <button onClick={() => void start()} className="lozenge">
                    Retry
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

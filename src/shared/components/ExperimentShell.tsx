import { Suspense, useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { FpsMeter } from '@/shared/components/FpsMeter'
import { Window } from '@/shared/components/aqua/Window'
import { Toolbar, ToolbarButton } from '@/shared/components/aqua/Toolbar'
import { useRecorder } from '@/shared/hooks/useRecorder'
import type { ExperimentEntry } from '@/shared/types'

export function ExperimentShell({ entry }: { entry: ExperimentEntry }) {
  const { metadata: meta, Component } = entry
  const navigate = useNavigate()
  const [paused, setPaused] = useState(false)
  const [resetKey, setResetKey] = useState(0)
  const [infoOpen, setInfoOpen] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const { recording, seconds, start, stop } = useRecorder(meta.slug)
  const isPortraitStage = meta.slug === 'flower-control'

  const toggleRecording = useCallback(() => {
    if (recording) stop()
    else if (stageRef.current) start(stageRef.current)
  }, [recording, start, stop])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void stageRef.current?.requestFullscreen()
  }, [])

  return (
    <div className="desktop grid min-h-dvh place-items-center p-4 sm:p-8">
      <Window
        title={`${meta.title} — musik.lab`}
        onClose={() => navigate('/')}
        className="aqua-pop h-[min(88dvh,760px)] w-[min(95vw,1000px)]"
        bodyClassName="bg-[#1c1b1f] grid place-items-center p-4"
        toolbar={
          <Toolbar>
            <ToolbarButton onClick={() => navigate('/')} title="Back to lab">
              ◀ Lab
            </ToolbarButton>
            <span className="text-[12px] font-medium text-ink2">{meta.title}</span>
            {recording && (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-red-600">
                <span className="size-2 animate-pulse rounded-full bg-red-600" />
                REC {seconds}s
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <ToolbarButton onClick={() => setPaused((p) => !p)} title="Pause / resume">
                {paused ? '▶' : '❚❚'}
              </ToolbarButton>
              <ToolbarButton onClick={() => setResetKey((k) => k + 1)} title="Reset">
                ↻
              </ToolbarButton>
              <ToolbarButton onClick={toggleFullscreen} title="Fullscreen">
                ⤢
              </ToolbarButton>
              <ToolbarButton active={infoOpen} onClick={() => setInfoOpen((o) => !o)} title="Info">
                ?
              </ToolbarButton>
            </div>
          </Toolbar>
        }
        footer={
          <>
            <span className="flex items-center gap-3">
              <FpsMeter paused={paused} />
              <span>{meta.needsWebcam ? (isPortraitStage ? '3:4' : '4:3') : 'canvas · 4:3'}</span>
            </span>
            <button
              onClick={toggleRecording}
              className="lozenge"
              data-active={recording}
              title={recording ? 'Stop recording' : 'Record'}
            >
              <span
                className={recording ? 'size-2 rounded-[2px] bg-red-500' : 'size-2 rounded-full bg-red-500'}
              />
              {recording ? `stop · ${seconds}s` : 'record'}
            </button>
          </>
        }
      >
        <figure
          className={[
            'relative w-full self-center',
            isPortraitStage
              ? 'aspect-[3/4] max-w-[min(90%,calc((88dvh-8rem)*3/4))]'
              : 'aspect-[4/3] max-w-[min(96%,calc((88dvh-8rem)*4/3))]',
          ].join(' ')}
        >
          <div
            ref={stageRef}
            data-recording-stage
            className={[
              'relative size-full overflow-hidden rounded-[6px] bg-lab-screen transition-shadow',
              recording ? 'ring-2 ring-red-500' : 'ring-1 ring-black/40',
            ].join(' ')}
          >
            <Suspense
              fallback={
                <div className="grid size-full place-items-center font-ui text-xs text-white/70">
                  loading…
                </div>
              }
            >
              <Component key={resetKey} paused={paused} />
            </Suspense>
          </div>
          {infoOpen && (
            <p className="absolute inset-x-0 bottom-2 mx-2 rounded-md bg-white/90 p-2 text-[11px] leading-5 text-ink2 shadow">
              {meta.controls || meta.description}
            </p>
          )}
        </figure>
      </Window>
    </div>
  )
}

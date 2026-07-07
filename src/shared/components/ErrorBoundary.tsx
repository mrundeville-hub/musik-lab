import { Component, type ReactNode } from 'react'

// ponytail: one boundary around the experiment page is enough; no per-widget
// boundaries, no error reporting — add if crashes need diagnosing remotely.
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <main className="desktop grid h-dvh place-items-center">
        <div className="win-shadow w-[min(90vw,360px)] overflow-hidden rounded-[10px] border border-win-line bg-win-body font-ui text-ink2">
          <div className="metal flex h-8 items-center border-b border-black/15 px-3 text-[12px] font-semibold">
            musik.lab
          </div>
          <div className="flex flex-col items-center gap-4 p-7 text-center">
            <div className="halftone size-12 rounded-md border border-black/20 bg-white/70" />
            <p className="text-[13px]">This experiment crashed — reload</p>
            <button
              onClick={() => window.location.reload()}
              className="lozenge"
              data-active
            >
              ↻ Reload
            </button>
          </div>
        </div>
      </main>
    )
  }
}

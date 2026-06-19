import { Link, useParams } from 'react-router-dom'
import { getExperiment } from '@/experiments/registry'
import { ExperimentShell } from '@/shared/components/ExperimentShell'

export function ExperimentPage() {
  const { slug } = useParams<{ slug: string }>()
  const entry = slug ? getExperiment(slug) : undefined

  if (!entry) {
    return (
      <main className="desktop grid h-dvh place-items-center">
        <div className="win-shadow w-[min(90vw,360px)] overflow-hidden rounded-[10px] border border-win-line bg-win-body font-ui text-ink2">
          <div className="metal flex h-8 items-center border-b border-black/15 px-3 text-[12px] font-semibold">
            musik.lab
          </div>
          <div className="flex flex-col items-center gap-4 p-7 text-center">
            <div className="halftone size-12 rounded-md border border-black/20 bg-white/70" />
            <p className="text-[13px]">
              Module not found — <span className="font-semibold">/{slug}</span>
            </p>
            <Link to="/" className="lozenge" data-active>
              ◀ Back to lab
            </Link>
          </div>
        </div>
      </main>
    )
  }

  // key forces a full remount (and thus full cleanup) when switching experiments
  return <ExperimentShell key={entry.metadata.slug} entry={entry} />
}

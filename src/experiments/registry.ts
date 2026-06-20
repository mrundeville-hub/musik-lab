import { lazy } from 'react'
import type {
  ExperimentEntry,
  ExperimentMetadata,
  ExperimentProps,
} from '@/shared/types'

/**
 * Auto-built registry: every src/experiments/<slug>/ folder with a
 * metadata.ts (default export ExperimentMetadata) and an index.ts
 * (default export of the experiment component) is picked up here.
 * Components load lazily — an experiment's code is only fetched when opened.
 */
const metadataModules = import.meta.glob<{ default: ExperimentMetadata }>(
  './*/metadata.ts',
  { eager: true },
)

const componentModules = import.meta.glob<{
  default: React.ComponentType<ExperimentProps>
}>('./*/index.ts')

export const experiments: ExperimentEntry[] = Object.entries(metadataModules)
  .map(([path, mod]) => {
    const indexPath = path.replace('metadata.ts', 'index.ts')
    const loader = componentModules[indexPath]
    if (!loader) {
      throw new Error(`Experiment at ${path} is missing index.ts`)
    }
    return { metadata: mod.default, Component: lazy(loader) }
  })
  .sort(
    (a, b) =>
      b.metadata.year - a.metadata.year ||
      a.metadata.title.localeCompare(b.metadata.title),
  )

export function getExperiment(slug: string): ExperimentEntry | undefined {
  return experiments.find((e) => e.metadata.slug === slug)
}

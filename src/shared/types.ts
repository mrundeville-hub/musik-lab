import type { ComponentType, LazyExoticComponent } from 'react'

export type ExperimentStatus = 'new' | 'draft' | 'migrated' | 'polished' | 'archived'

export interface ExperimentMetadata {
  title: string
  slug: string
  description: string
  year: number
  status: ExperimentStatus
  tags: string[]
  technologies: string[]
  needsWebcam?: boolean
  needsAudio?: boolean
  /** path relative to public/, e.g. "previews/ascii-flow-field.png" */
  preview?: string
  /** short human description of the interaction, e.g. "move pointer to disturb the field" */
  controls?: string
  performanceNotes?: string
}

export interface ExperimentProps {
  paused: boolean
}

export interface ExperimentEntry {
  metadata: ExperimentMetadata
  Component: LazyExoticComponent<ComponentType<ExperimentProps>>
}

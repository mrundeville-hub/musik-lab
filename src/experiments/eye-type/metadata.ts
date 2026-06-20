import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'Eye Type',
  slug: 'eye-type',
  description:
    'Face tracking finds your eyes and letters of a word pour out of them as rigid bodies — spinning, colliding and piling up at the bottom of the screen.',
  year: 2026,
  status: 'migrated',
  tags: ['webcam', 'physics', '3d', 'typography'],
  technologies: ['react-three-fiber', 'rapier', 'mediapipe face landmarker'],
  needsWebcam: true,
  controls: 'type a word in the panel; look around to move the emitters',
  performanceNotes: 'face tracking at 12fps; active letters capped at 600',
} satisfies ExperimentMetadata

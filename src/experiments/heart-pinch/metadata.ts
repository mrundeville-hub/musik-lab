import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'Heart Pinch',
  slug: 'heart-pinch',
  description:
    'Hand tracking follows the index and thumb of both hands. Make a finger heart — cross the fingertips — and heart emoji stream out of the crossing point, tumbling down as rigid bodies until they fill the screen.',
  year: 2026,
  status: 'migrated',
  tags: ['webcam', 'physics', 'hands', 'emoji'],
  technologies: ['react-three-fiber', 'rapier', 'mediapipe hand landmarker'],
  needsWebcam: true,
  controls: 'make a finger heart on either hand to pour hearts',
  performanceNotes: 'hand tracking at 12fps; active hearts capped at 600',
} satisfies ExperimentMetadata

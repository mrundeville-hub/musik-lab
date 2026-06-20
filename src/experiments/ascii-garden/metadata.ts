import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'Garden',
  slug: 'ascii-garden',
  description:
    'A webcam scene rendered in ASCII where pinching your fingers drops water onto the ground. Drops feed procedural ASCII flowers that grow in stages above a strip of flickering grass.',
  year: 2026,
  status: 'migrated',
  tags: ['ascii', 'webcam', 'generative', 'canvas2d'],
  technologies: ['canvas 2d', 'mediapipe hand landmarker'],
  needsWebcam: true,
  controls: 'pinch thumb + index finger and hold to release a drop',
  performanceNotes: 'single hand tracked; ascii sampling on a fixed grid',
} satisfies ExperimentMetadata

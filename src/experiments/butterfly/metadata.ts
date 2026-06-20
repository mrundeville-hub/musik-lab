import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'Butterfly',
  slug: 'butterfly',
  description:
    'A detailed ASCII butterfly drifts lazily across the screen. Show your index fingers and it slowly glides over and perches on the tip.',
  year: 2026,
  status: 'new',
  tags: ['webcam', 'ascii', 'mediapipe', 'gesture'],
  technologies: ['canvas2d', 'mediapipe hand landmarker'],
  needsWebcam: true,
  controls: 'hold up one or two index fingers — the butterfly will land on the nearest one',
  performanceNotes: 'hand tracking at 20fps; ~115 characters drawn per frame',
} satisfies ExperimentMetadata

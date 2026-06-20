import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'ASCII Aquarium',
  slug: 'ascii-aquarium',
  description:
    'A boids school of ASCII fish swims across the webcam. Open palms scatter the school; cupped fingers pull them in to feed.',
  year: 2026,
  status: 'draft',
  tags: ['webcam', 'hands', 'ascii', 'audio'],
  technologies: ['canvas 2d', 'mediapipe hand landmarker', 'web audio', 'boids'],
  needsWebcam: true,
  needsAudio: true,
  controls: 'show an open palm to scare the fish; pinch/cup your fingers to feed them',
  performanceNotes: 'two hands tracked at video cadence; fish count capped at 72',
} satisfies ExperimentMetadata

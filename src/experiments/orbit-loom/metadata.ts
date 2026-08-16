import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'Orbit Loom',
  emoji: '🪐',
  blurb: 'Fingertips weave elastic orbital springs.',
  slug: 'orbit-loom',
  description:
    'Each fingertip becomes a node in a geometric loom. Elastic springs stretch between neighbours and cross-links, orbiting with soft physics. Make a fist and the orbits collapse into a dense knot; open your hand and they bloom outward. Two hands become two clusters bridged by a faint tether.',
  year: 2026,
  status: 'new',
  tags: ['webcam', 'hands', 'geometry', 'audio', 'gesture'],
  technologies: ['canvas 2d', 'mediapipe hand landmarker', 'spring physics', 'web audio'],
  needsWebcam: true,
  needsAudio: true,
  controls:
    'show one or two hands; open fingers to expand orbits, close into a fist to collapse them. Tension spikes pluck glass notes.',
  performanceNotes:
    'up to 2 hands × 4 fingertip nodes + spring links; physics at display rate; hand detect ~30fps',
} satisfies ExperimentMetadata

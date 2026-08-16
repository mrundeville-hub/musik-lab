import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'Soap Film',
  emoji: '🫧',
  blurb: 'Stretch a rainbow film until it pops.',
  slug: 'soap-film',
  description:
    'Pinch thumb and index and a soap-bubble membrane spans the gap, alive with thin-film interference. Pull your fingers apart and the film thins — the rainbow fringes tighten and race — until it stretches too far and bursts into a spray of iridescent droplets and drifting bubbles. Close your fingers and a fresh film blooms with a soft chime.',
  year: 2026,
  status: 'new',
  tags: ['webcam', 'hands', 'iridescent', 'audio', 'gesture'],
  technologies: ['canvas 2d', 'mediapipe hand landmarker', 'thin-film interference', 'web audio'],
  needsWebcam: true,
  needsAudio: true,
  controls:
    'pinch thumb + index on one or both hands to hold a soap film; slowly open the pinch to stretch and thin it; open too far and it pops. Bring the fingers back together to reform it.',
  performanceNotes:
    'up to two hands tracked at ~30fps; each film is a clipped radial interference gradient (~14 hue stops) plus two sheen lobes; burst droplets + bubbles capped at 160',
} satisfies ExperimentMetadata

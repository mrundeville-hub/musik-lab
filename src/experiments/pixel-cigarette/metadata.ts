import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'Pixel Cigarette',
  slug: 'pixel-cigarette',
  emoji: '🚬',
  blurb: 'Pinch a pixel cigarette, take a drag, and exhale smoke from your mouth and nose.',
  description:
    'A tiny pixel-art cigarette floats through the lower part of the live webcam. Pinch it with two fingers, carry it to your lips, then pull away to release a drifting pixel smoke trail.',
  year: 2026,
  status: 'new',
  tags: ['webcam', 'pixel-art', 'hands', 'face', 'gesture'],
  technologies: [
    'canvas2d',
    'mediapipe hand landmarker',
    'mediapipe face landmarker',
    'particle system',
  ],
  needsWebcam: true,
  controls:
    'pinch index + thumb or index + middle finger on the cigarette, drag it to your lips, then move it away to make pixel smoke',
  performanceNotes:
    'up to two hands and one face tracked at ~30fps; lightweight pixel particle overlay with a capped smoke pool',
} satisfies ExperimentMetadata

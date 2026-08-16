import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'Paper Airplane',
  emoji: '✈️',
  blurb: 'Fold a plane from your face and flick it.',
  slug: 'paper-airplane',
  description:
    'Pinch to fold a paper airplane from a scrap of your live face, then flick to launch it across the room. A second hand can fan the air — the plane banks and glides on the breeze until it soft-lands with a glass chime.',
  year: 2026,
  status: 'new',
  tags: ['webcam', 'hands', 'face', 'audio', 'gesture'],
  technologies: ['canvas 2d', 'mediapipe hand landmarker', 'mediapipe face landmarker', 'simple flight model', 'web audio'],
  needsWebcam: true,
  needsAudio: true,
  controls:
    'pinch near your face to fold a plane from your webcam texture; flick outward to launch. Wave the other hand to blow / steer. Planes soft-land and fade.',
  performanceNotes:
    'face + two hands at ~30fps; up to 6 planes; each carries a small face crop as texture on a triangle mesh drawn in 2D',
} satisfies ExperimentMetadata

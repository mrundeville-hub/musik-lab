import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'Spirit Masks',
  slug: 'spirit-masks',
  description:
    'A trembling 3D particle mask locks onto your face — ornate lacquer demon, cracked ghost, white oni, crash-test dummy, translucent skull, domino, luchador, a noh face covered in eyes, hammered gold with a long nose. Pinch thumb and index to dissolve into the next one.',
  year: 2026,
  status: 'draft',
  tags: ['webcam', 'face', 'hands', 'particles', 'audio', 'weirdo'],
  technologies: ['canvas 2d', 'mediapipe face landmarker', 'mediapipe hand landmarker', 'web audio'],
  needsWebcam: true,
  needsAudio: true,
  controls: 'face the camera; pinch thumb + index fingertip to switch masks',
  performanceNotes: 'portrait textures sampled into ~14k soft-splat spring particles with silhouette edge fade and additive bloom, face frame from eye landmarks',
} satisfies ExperimentMetadata

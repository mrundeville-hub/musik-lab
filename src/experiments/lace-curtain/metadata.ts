import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'Lace Curtain',
  slug: 'lace-curtain',
  description:
    'An ASCII lace curtain — the kind that hung in every Soviet apartment window — drapes in front of your face, as if your face were the window. It sways gently; raise your index fingers and pull the two halves apart to peek through the tulle.',
  year: 2026,
  status: 'new',
  tags: ['webcam', 'ascii', 'mediapipe', 'gesture'],
  technologies: ['canvas2d', 'mediapipe hand landmarker', 'mediapipe face landmarker'],
  needsWebcam: true,
  controls:
    'the curtain hangs over your face — move your left index finger to drag the left half open, the right finger for the right half. Lower your hands and it drifts shut.',
  performanceNotes: 'face + two hands tracked at ~30fps; lace re-sampled on a character grid, drawn only over the face window',
} satisfies ExperimentMetadata

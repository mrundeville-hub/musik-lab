import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'Lace Curtain',
  slug: 'lace-curtain',
  description:
    'A lace tulle curtain — the kind that hung in every Soviet apartment window — drapes in front of your face, as if your face were the window. The cloth hangs and sways under simulated physics; raise your index fingers and pull the two halves apart to peek through, with soft glass tones for every part, close and billow.',
  year: 2026,
  status: 'new',
  tags: ['webcam', 'webgl', 'cloth', 'mediapipe', 'gesture', 'audio'],
  technologies: ['three.js', 'verlet cloth', 'mediapipe hand landmarker', 'mediapipe face landmarker', 'web audio'],
  needsWebcam: true,
  needsAudio: true,
  controls:
    'the curtain hangs over your face — move your left index finger to drag the left half open, the right finger for the right half. Lower your hands and it drifts shut.',
  performanceNotes: 'face + two hands tracked at ~30fps; two Verlet cloth panels (~500 particles) simulated and lit per frame',
} satisfies ExperimentMetadata

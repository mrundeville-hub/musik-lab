import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'Cat Gestures',
  slug: 'cat-gestures',
  description:
    'Show a hand gesture to the camera and get the matching cat meme. Portrait 9:16 stack: meme on top, live webcam strip below.',
  year: 2026,
  status: 'new',
  tags: ['webcam', 'hands', 'face', 'meme', 'portrait'],
  technologies: ['react', 'mediapipe hand landmarker', 'mediapipe face landmarker'],
  needsWebcam: true,
  controls:
    'pray 🙏 · point up ☝️ · shy 👉👈 · fist 👊 · shush 🤫 (finger at lips) · shaka 🤙',
  performanceNotes: 'hand+face landmarks ~20–30fps; meme swap debounced ~3–5 frames',
} satisfies ExperimentMetadata

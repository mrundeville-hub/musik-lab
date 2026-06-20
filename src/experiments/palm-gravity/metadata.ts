import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'Palm Gravity',
  slug: 'palm-gravity',
  description:
    'An open palm turns philosopher quotes into an event horizon over the live webcam. Make a fist and the orbiting letters settle into another thinker.',
  year: 2026,
  status: 'draft',
  tags: ['webcam', 'hands', 'typography', 'ascii'],
  technologies: ['canvas2d', 'mediapipe hand landmarker'],
  needsWebcam: true,
  controls: 'open your palm to form the black hole; close a fist to release and recompose a random quote from Aristotle through Deleuze',
  performanceNotes: 'hand tracking at ~20fps; live webcam backdrop with soft cosmic overlay; quote particles draw trails, lensing rings, and an accretion disk',
} satisfies ExperimentMetadata

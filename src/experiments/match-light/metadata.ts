import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'Match Light',
  emoji: '🔥',
  blurb: 'Strike a match. The rest of the room goes dark.',
  slug: 'match-light',
  description:
    'The room drops to black. Pinch thumb and index to strike a match — a small live flame throws a warm, flickering pool of light that reveals only what it touches. Breathe toward it and the flame leans and gutters; blow hard and it snuffs out into darkness. Strike again to relight.',
  year: 2026,
  status: 'new',
  tags: ['webcam', 'hands', 'face', 'audio', 'weirdo'],
  technologies: ['canvas 2d', 'mediapipe hand landmarker', 'mediapipe face landmarker', 'light-map compositing', 'web audio'],
  needsWebcam: true,
  needsAudio: true,
  controls:
    'pinch thumb + index (one or two hands) to strike and hold a match; move it to light different parts of the dark. Open your mouth and breathe toward the flame to make it flicker and blow it out — pinch again to relight.',
  performanceNotes:
    'darkness is a single warm light-map multiply per frame (one radial per lit match); procedural flame with embers; hand + face tracked at ~30fps',
} satisfies ExperimentMetadata

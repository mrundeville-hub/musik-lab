import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'String Between Us',
  emoji: '🎸',
  blurb: 'A glass string rings between two index fingers.',
  slug: 'string-between',
  description:
    'Hold up both index fingers and a living glass string spans the gap. Pluck it with a flick and it rings; stretch the distance to raise the pitch, tilt the line for vibrato. Bring the tips together and the string knots into a soft chord, then dissolves into sparkles.',
  year: 2026,
  status: 'new',
  tags: ['webcam', 'hands', 'audio', 'gesture'],
  technologies: ['canvas 2d', 'mediapipe hand landmarker', 'verlet string', 'web audio'],
  needsWebcam: true,
  needsAudio: true,
  controls:
    'show both index fingers to form the string; flick one finger across it to pluck; move hands apart for higher pitch; tip the line for vibrato; tap fingertips together to resolve into a chord.',
  performanceNotes:
    'two hands at ~30fps; 18-segment spring string with one pluck impulse; glass bells map gap→pitch',
} satisfies ExperimentMetadata

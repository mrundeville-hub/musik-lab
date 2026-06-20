import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'Breath Garden',
  slug: 'breath-garden',
  description:
    'Pinch your index finger and thumb to hold an ASCII dandelion by the stem, then blow at it on camera and watch the white seeds fly away.',
  year: 2026,
  status: 'draft',
  tags: ['webcam', 'hands', 'ascii', 'audio'],
  technologies: ['canvas 2d', 'mediapipe hand landmarker', 'mediapipe face landmarker', 'web audio', 'particle system'],
  needsWebcam: true,
  needsAudio: true,
  controls: 'pinch index + thumb to hold the lower stem; open your mouth and blow toward the puff to send seeds into the wind',
  performanceNotes: 'one hand and one face tracked at ~20fps; mouth openness drives breath gusts; dandelion head is offset above the pinch grip',
} satisfies ExperimentMetadata

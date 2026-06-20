import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'Ripple',
  slug: 'ascii-ripple',
  description:
    'A webcam mirror rendered as ASCII, with a wave-equation ripple field on top. Fingertips (hand tracking) or clicks throw energy into the field; characters brighten and refract along the wave gradient.',
  year: 2026,
  status: 'migrated',
  tags: ['ascii', 'webcam', 'physics', 'canvas2d'],
  technologies: ['canvas 2d', 'mediapipe hand landmarker', 'wave equation'],
  needsWebcam: true,
  controls:
    'bring fingertips close to the camera to splash; click/drag works as fallback',
  performanceNotes:
    'ripple sim on a char grid; video sampled at half resolution; hand tracking ~30fps',
} satisfies ExperimentMetadata

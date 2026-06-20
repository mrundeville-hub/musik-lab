import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'Thermal Window',
  slug: 'thermal-window',
  description:
    'A webcam piece where both index-thumb pairs open a live thermal rectangle inside the normal camera image.',
  year: 2026,
  status: 'new',
  tags: ['webcam', 'hands', 'video', 'thermal'],
  technologies: ['react', 'mediapipe hand landmarker', 'canvas video processing', 'media recorder'],
  needsWebcam: true,
  controls:
    'show both hands; the rectangle follows the index and thumb tips, while the camera remains normal outside it',
  performanceNotes:
    'tracks two hands at video-frame cadence and processes only a downsampled crop for the thermal view',
} satisfies ExperimentMetadata

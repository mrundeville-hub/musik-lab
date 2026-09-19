import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'Butterfly 2.0',
  slug: 'butterfly-2',
  description:
    'An ASCII butterfly lands on your fingertip and releases a wave that turns your live image into green terminal art.',
  year: 2026,
  status: 'new',
  tags: ['webcam', 'ascii', 'mediapipe', 'gesture'],
  technologies: ['canvas2d', 'mediapipe hand landmarker', 'mediapipe image segmenter'],
  needsWebcam: true,
  controls: 'hold up an index finger — landing transforms the camera into live ASCII',
  performanceNotes: 'downsampled ASCII sampling, 30fps hand tracking, 12.5fps person segmentation',
} satisfies ExperimentMetadata

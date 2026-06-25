import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'Two-Hand Loom',
  slug: 'two-hand-loom',
  description:
    'A curtain of threads hanging across the webcam, parallel to your face: brush them with your fingers to pluck and bend each strand, then pinch one and drag it onto a neighbour to stitch the threads together into a growing pattern.',
  year: 2026,
  status: 'new',
  tags: ['webcam', 'hands', 'canvas2d', 'audio', 'gesture'],
  technologies: ['canvas 2d', 'mediapipe hand landmarker', 'web audio'],
  needsWebcam: true,
  needsAudio: true,
  controls:
    'move a fingertip across the hanging threads to pluck and bend them; pinch index + thumb on a thread and drag onto a neighbour to stitch them together. one or two hands both work.',
  performanceNotes:
    'up to two hands tracked at ~30fps; 22 spring-lerped strands plus a capped set of cross-stitches (~170), all flat-cost canvas drawing',
} satisfies ExperimentMetadata

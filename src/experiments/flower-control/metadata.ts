import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'Flower Control',
  slug: 'flower-control',
  description:
    'A portrait camera piece where your right index-thumb distance scrubs a blooming flower and your left pinch switches the flower clip.',
  year: 2026,
  status: 'new',
  tags: ['webcam', 'hands', 'video', 'portrait'],
  technologies: ['react', 'mediapipe hand landmarker', 'html video', 'canvas overlay', 'media recorder'],
  needsWebcam: true,
  needsAudio: true,
  controls:
    'right hand opens/closes the bloom timeline; left index + thumb pinch switches hibiscus, lily, and poppy clips',
  performanceNotes:
    'two hands tracked at ~30fps; 3:4 portrait capture stacks a cropped flower plate over a mirrored 16:9 webcam plate',
} satisfies ExperimentMetadata

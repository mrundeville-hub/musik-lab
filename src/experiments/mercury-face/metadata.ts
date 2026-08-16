import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'Mercury Face',
  emoji: '🪞',
  blurb: 'Your silhouette fills with liquid metal.',
  slug: 'mercury-face',
  description:
    'A selfie-segmenter silhouette floods with mercury — specular highlights, soft wobble from head motion. Pinch near the metal and a droplet tears free, falls, and reabsorbs into the pool with a cold glass tone.',
  year: 2026,
  status: 'new',
  tags: ['webcam', 'hands', 'silhouette', 'physics', 'audio'],
  technologies: ['canvas 2d', 'mediapipe image segmenter', 'mediapipe hand landmarker', 'metaball droplets', 'web audio'],
  needsWebcam: true,
  needsAudio: true,
  controls:
    'face the camera so the silhouette fills; move your head to ripple the mercury; pinch near the edge to tear a droplet free.',
  performanceNotes:
    'low-res mask (~192×108) upscaled; droplets capped at 12; segmenter + hands ~30fps',
} satisfies ExperimentMetadata

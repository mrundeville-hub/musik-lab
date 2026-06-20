import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'Snowfall',
  slug: 'ascii-snowfall',
  description:
    'Letters of a word you type fall like snow and settle exactly on your silhouette. Move, and they get pushed around or tumble off.',
  year: 2026,
  status: 'draft',
  tags: ['webcam', 'silhouette', 'ascii', 'audio', 'text'],
  technologies: ['canvas 2d', 'mediapipe image segmenter', 'web audio'],
  needsWebcam: true,
  needsAudio: true,
  controls: 'type a word in the input; letters land on your head and shoulders — move to shake them off',
  performanceNotes: 'selfie segmentation runs per frame; the confidence mask drives landing and displacement',
} satisfies ExperimentMetadata

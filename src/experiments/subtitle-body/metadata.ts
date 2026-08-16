import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'Subtitle Body',
  emoji: '💬',
  blurb: 'Captions crawl your silhouette like burned-in text.',
  slug: 'subtitle-body',
  description:
    'Live captions crawl across your silhouette like burned-in subtitles. Type a line and the letters ride your outline; move and the text fractures, slips, and reassembles along the edge. Soft ticks mark every word that finds a place to land.',
  year: 2026,
  status: 'new',
  tags: ['webcam', 'silhouette', 'ascii', 'text', 'audio'],
  technologies: ['canvas 2d', 'mediapipe image segmenter', 'edge crawling', 'web audio'],
  needsWebcam: true,
  needsAudio: true,
  controls:
    'type a phrase in the input; letters stream along your silhouette edge. Move to shake them loose — they tumble and re-stick elsewhere.',
  performanceNotes:
    'selfie segmentation at ~20fps on a 160×90 mask; edge pixels sampled once per frame; active letters capped at 120',
} satisfies ExperimentMetadata

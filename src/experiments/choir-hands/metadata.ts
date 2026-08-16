import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'Choir Hands',
  emoji: '🎶',
  blurb: 'Each fingertip is a voice in a glass choir.',
  slug: 'choir-hands',
  description:
    'Each fingertip is a voice in a soft glass choir. Open your palm and the voices bloom into a chord; curl fingers shut and they hush to a whisper. Spread and tilt your hands to revoice the harmony — distance between hands opens the hall.',
  year: 2026,
  status: 'new',
  tags: ['webcam', 'hands', 'audio', 'gesture'],
  technologies: ['canvas 2d', 'mediapipe hand landmarker', 'web audio', 'sustained voices'],
  needsWebcam: true,
  needsAudio: true,
  controls:
    'open a palm to swell the choir; curl fingers to hush; raise/lower for pitch band; two-hand distance widens the space. Each fingertip lights a voice.',
  performanceNotes:
    'up to two hands at ~30fps; five sustained glass voices per hand via GlassAudio bells on attack + pad brightness; no per-frame oscillator churn beyond sparkles',
} satisfies ExperimentMetadata

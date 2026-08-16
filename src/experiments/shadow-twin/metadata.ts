import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'Shadow Twin',
  emoji: '👤',
  blurb: 'Your shadow lags — and sometimes walks off.',
  slug: 'shadow-twin',
  description:
    'Your silhouette is cut from the camera and cast back as an inky shadow that trails about a second behind you — a twin that mostly mimics, but now and then unglues itself and drifts off with a mind of its own. Pinch to grab it by the edge and drag it back into sync, snapping the delay shut with a chime.',
  year: 2026,
  status: 'new',
  tags: ['webcam', 'silhouette', 'hands', 'audio', 'weirdo'],
  technologies: ['canvas 2d', 'mediapipe image segmenter', 'mediapipe hand landmarker', 'frame ring buffer', 'web audio'],
  needsWebcam: true,
  needsAudio: true,
  controls:
    'move around — your shadow lags behind and sometimes wanders on its own. Pinch thumb + index (either hand) to pull it back into sync; let go and it drifts back into lag.',
  performanceNotes:
    'selfie segmentation at ~30fps stored in a ~3s ring buffer of 192×108 masks; delayed silhouette composited as a tinted shadow; hand tracking shares the frame budget',
} satisfies ExperimentMetadata

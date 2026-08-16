import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'Iris Kaleidoscope',
  emoji: '🧿',
  blurb: 'Your pupils become kaleidoscope hubs.',
  slug: 'iris-kaleidoscope',
  description:
    'Your pupils become the two hubs of a live kaleidoscope over the webcam. Look around and the mirrored shards orbit with your gaze; blink and the whole pattern re-seeds into a new crystal. Soft glass tones track every blink and glance.',
  year: 2026,
  status: 'new',
  tags: ['webcam', 'face', 'kaleidoscope', 'audio'],
  technologies: ['canvas 2d', 'mediapipe face landmarker', 'polar mirroring', 'web audio'],
  needsWebcam: true,
  needsAudio: true,
  controls:
    'face the camera — your irises drive the kaleidoscope centers. Look around to spin the shards; blink (or close both eyes briefly) to reshuffle the pattern.',
  performanceNotes:
    'face at ~25fps; kaleidoscope is 8-wedge polar redraw of a downsampled webcam crop (~256px) around the eye midpoint',
} satisfies ExperimentMetadata

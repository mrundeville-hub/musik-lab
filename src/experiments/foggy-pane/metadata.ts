import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'Foggy Pane',
  emoji: '🌫️',
  blurb: 'Breathe fog onto the glass, then wipe it clear.',
  slug: 'foggy-pane',
  description:
    'The camera becomes a cold window that fogs over. Breathe at it and the glass mists up around your mouth; drag a fingertip to wipe a clear streak through the condensation and peek out, with soft glass tones tracing every stroke. Left alone, the pane slowly fogs back up and water beads run down.',
  year: 2026,
  status: 'new',
  tags: ['webcam', 'hands', 'face', 'audio', 'weirdo'],
  technologies: ['canvas 2d', 'mediapipe hand landmarker', 'mediapipe face landmarker', 'web audio', 'condensation field'],
  needsWebcam: true,
  needsAudio: true,
  controls:
    'open your mouth and breathe toward the camera to fog the glass; move a fingertip (one or two hands) to wipe it clear. Stop touching it and the condensation creeps back, with drips sliding down the cleared streaks.',
  performanceNotes:
    'condensation runs on a low-res fog grid (~1 cell / 9px) blurred up with bilinear scaling; hand + face tracked at ~30fps; drips capped at 90',
} satisfies ExperimentMetadata

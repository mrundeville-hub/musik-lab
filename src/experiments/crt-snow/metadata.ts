import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'CRT Snow',
  emoji: '📺',
  blurb: 'Your webcam through a dying CRT.',
  slug: 'crt-snow',
  description:
    'The feed is crushed through scanlines, bloom and a soft barrel CRT. Snap your fingers (pinch then release) to kick a horizontal roll. Cover the lens with a palm and the picture dissolves into white snow. Open your mouth and VHS tracking tears rip through the image.',
  year: 2026,
  status: 'new',
  tags: ['webcam', 'hands', 'face', 'glitch', 'audio'],
  technologies: ['canvas 2d', 'mediapipe hand landmarker', 'mediapipe face landmarker', 'crt compositing', 'web audio'],
  needsWebcam: true,
  needsAudio: true,
  controls:
    'pinch-release to snap-roll the picture; hold a palm close to the camera for static snow; open your mouth for tracking tears.',
  performanceNotes:
    'one offscreen webcam blit + scanline overlay per frame; hand + face at ~30fps; snow particles capped at 900 when palm covers',
} satisfies ExperimentMetadata

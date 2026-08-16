import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'Radio Dial',
  emoji: '📻',
  blurb: 'Rotate an open palm to tune glass stations.',
  slug: 'radio-dial',
  description:
    'Your open palm becomes a radio dial. Rotate it to tune through stations of generative glass noise and melody; make a fist to click the set off. Soft dial ticks and station beds fill the dark room.',
  year: 2026,
  status: 'new',
  tags: ['webcam', 'hands', 'audio', 'gesture'],
  technologies: ['canvas 2d', 'mediapipe hand landmarker', 'web audio', 'station morphing'],
  needsWebcam: true,
  needsAudio: true,
  controls:
    'open your palm and rotate it like a dial to tune stations; close into a fist to power off. Two hands: left = coarse tune, right = fine.',
  performanceNotes:
    'one or two hands at ~30fps; palm angle → station index; GlassAudio pad + bells for station beds',
} satisfies ExperimentMetadata

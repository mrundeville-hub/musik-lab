import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'Typewriter Gaze',
  emoji: '⌨️',
  blurb: 'Look to type. Blink for space.',
  slug: 'typewriter-gaze',
  description:
    'Your gaze is the carriage. Letters of a typed word appear where you look; blink for space, a longer blink for a new line. The poem writes itself in the air until the page fills with soft glass keystrokes.',
  year: 2026,
  status: 'new',
  tags: ['webcam', 'face', 'typography', 'audio'],
  technologies: ['canvas 2d', 'mediapipe face landmarker', 'gaze proxy', 'web audio'],
  needsWebcam: true,
  needsAudio: true,
  controls:
    'type a word in the panel; look around to place the next letter. Short blink = space, long blink (~0.45s) = new line. Clear resets the page.',
  performanceNotes:
    'face at ~25fps; gaze from iris midpoint + head pose proxy; typed glyphs capped at 180',
} satisfies ExperimentMetadata

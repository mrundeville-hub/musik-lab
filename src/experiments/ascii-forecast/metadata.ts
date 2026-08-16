import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'ASCII Forecast',
  emoji: '⛅',
  blurb: 'Your face becomes a live ASCII weather map.',
  slug: 'ascii-forecast',
  description:
    'The screen turns into a terminal weather map made of glyphs. Smile and the field fills with sun characters; frown and rain streaks fall. Turn your head and wind blows the glyphs sideways; blink and a lightning bolt flashes across the grid with a glass crack.',
  year: 2026,
  status: 'new',
  tags: ['webcam', 'face', 'ascii', 'audio', 'weirdo'],
  technologies: ['canvas 2d', 'mediapipe face landmarker', 'glyph field', 'web audio'],
  needsWebcam: true,
  needsAudio: true,
  controls:
    'smile for sun, frown for rain, turn your head to blow wind, blink for lightning. Face the camera with good light.',
  performanceNotes:
    'glyph grid ~14px cells; face tracked at ~30fps; rain drops capped at 120; lightning is a one-frame flash',
} satisfies ExperimentMetadata

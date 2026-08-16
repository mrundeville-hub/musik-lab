import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'Mouth Aquarium',
  emoji: '🐠',
  blurb: 'Open your mouth and ASCII fish swim out.',
  slug: 'mouth-aquarium',
  description:
    'Open your mouth and a tiny ASCII aquarium spills out — fish swim from your lips into the air. Close your mouth and they panic, bumping against the sealed lips. Soft glass chimes mark every school that escapes.',
  year: 2026,
  status: 'new',
  tags: ['webcam', 'face', 'ascii', 'audio', 'weirdo'],
  technologies: ['canvas 2d', 'mediapipe face landmarker', 'particle flock', 'web audio'],
  needsWebcam: true,
  needsAudio: true,
  controls:
    'open your mouth to release ASCII fish; keep it open and they drift outward; close it and fish near the lips bounce back. Move your head to steer the school.',
  performanceNotes:
    'face tracked at ~25fps; fish capped at 48; mouth openness drives spawn rate',
} satisfies ExperimentMetadata

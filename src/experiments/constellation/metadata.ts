import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'Constellation',
  slug: 'constellation',
  description:
    'All ten fingertips become stars. Nearby fingers connect into living ASCII constellations over a darkened webcam sky.',
  year: 2026,
  status: 'draft',
  tags: ['webcam', 'hands', 'ascii', 'audio'],
  technologies: ['canvas 2d', 'mediapipe hand landmarker', 'web audio'],
  needsWebcam: true,
  needsAudio: true,
  controls: 'move both hands; bring fingertips together to make and break constellations',
  performanceNotes: 'tracks up to two hands and tests fingertip edges only',
} satisfies ExperimentMetadata

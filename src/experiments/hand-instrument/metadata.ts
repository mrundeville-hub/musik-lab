import type { ExperimentMetadata } from '@/shared/types'

export default {
  title: 'Hand Instrument',
  slug: 'hand-instrument',
  description:
    'A hand-tracked performance instrument: pinch to play a lead, open your palm for a harmony pad, choose root/scale, and perform over a programmable soul-chord drum machine.',
  year: 2026,
  status: 'polished',
  tags: ['webcam', 'hands', 'ascii', 'audio'],
  technologies: ['canvas 2d', 'mediapipe hand landmarker', 'web audio'],
  needsWebcam: true,
  needsAudio: true,
  controls:
    'Pinch index+thumb to play a lead note; open a palm to fade in a harmony pad. Move left/right for pitch or chord, up/down for brightness, spread fingers for vibrato. Pick SYNTH, ROOT and SCALE; distance between two hands controls delay/space. Beat station: PLAY/STOP, BPM, kit select and 16-step programming.',
  performanceNotes:
    'Custom Web Audio engine: two lead voices, an open-palm harmony pad, compressor/limiter, delay macro, plus a lookahead-scheduled swung sequencer for kick/snare/hat, saturated 808 bass and chord stabs. Render and detection throttled to ~60/33fps.',
} satisfies ExperimentMetadata

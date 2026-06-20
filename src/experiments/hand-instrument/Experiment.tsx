import { useEffect, useRef, useState } from 'react'
import type { HandLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision'
import { WebcamGate } from '@/shared/components/WebcamGate'
import { SoundToggle } from '@/shared/components/SoundToggle'
import type { ExperimentProps } from '@/shared/types'
import { createHandLandmarker } from '@/shared/lib/mediapipe'
import { registerAudioStream } from '@/shared/lib/audioCapture'

// ── musical helpers ───────────────────────────────────────────
// Scales across ~2 octaves, semitone offsets from a root.
const SCALES = [
  { id: 'minor-pent', label: 'MINOR PENT', steps: [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24] },
  { id: 'major-pent', label: 'MAJOR PENT', steps: [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24] },
  { id: 'dorian', label: 'DORIAN', steps: [0, 2, 3, 5, 7, 9, 10, 12, 14, 15, 17, 19, 21, 22, 24] },
  { id: 'harm-min', label: 'HARM MIN', steps: [0, 2, 3, 5, 7, 8, 11, 12, 14, 15, 17, 19, 20, 23, 24] },
] as const
type ScaleId = (typeof SCALES)[number]['id']
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const ROOTS = [
  { name: 'C', midi: 48 },
  { name: 'D', midi: 50 },
  { name: 'Eb', midi: 51 },
  { name: 'F', midi: 53 },
  { name: 'G', midi: 55 },
  { name: 'A', midi: 57 },
] as const

function midiToFreq(m: number) {
  return 440 * Math.pow(2, (m - 69) / 12)
}
function midiToName(m: number) {
  const r = Math.round(m)
  return `${NOTE_NAMES[((r % 12) + 12) % 12]}${Math.floor(r / 12) - 1}`
}
/** map 0..1 across screen X to a quantized scale midi note */
function quantizeX(t: number, rootMidi: number, scaleId: ScaleId) {
  const scale = SCALES.find((s) => s.id === scaleId)?.steps ?? SCALES[0].steps
  const idx = Math.max(0, Math.min(scale.length - 1, Math.round(t * (scale.length - 1))))
  return rootMidi + scale[idx]
}

// ── synth presets ─────────────────────────────────────────────
interface SynthPreset {
  id: string
  label: string
  osc: OscillatorType
  osc2?: OscillatorType
  detune2?: number
  attack: number
  release: number
  baseCutoff: number
  cutoffRange: number
  q: number
  fm?: { ratio: number; depth: number } // for bell-like FM
  gain: number
}
const SYNTHS: SynthPreset[] = [
  { id: 'sine', label: 'SINE PAD', osc: 'sine', osc2: 'sine', detune2: 7, attack: 0.18, release: 0.6, baseCutoff: 700, cutoffRange: 3500, q: 1, gain: 0.5 },
  { id: 'saw', label: 'SAW LEAD', osc: 'sawtooth', attack: 0.02, release: 0.25, baseCutoff: 400, cutoffRange: 5000, q: 6, gain: 0.32 },
  { id: 'square', label: 'SQUARE PLUCK', osc: 'square', attack: 0.005, release: 0.18, baseCutoff: 600, cutoffRange: 4200, q: 3, gain: 0.28 },
  { id: 'fm', label: 'FM BELL', osc: 'sine', attack: 0.004, release: 1.2, baseCutoff: 1200, cutoffRange: 6000, q: 0.5, fm: { ratio: 3.01, depth: 380 }, gain: 0.4 },
]

// ── one playing voice ─────────────────────────────────────────
class Voice {
  osc: OscillatorNode
  osc2?: OscillatorNode
  fmOsc?: OscillatorNode
  fmGain?: GainNode
  filter: BiquadFilterNode
  amp: GainNode
  vibrato: OscillatorNode
  vibratoGain: GainNode
  preset: SynthPreset
  gated = false

  constructor(ctx: AudioContext, dest: AudioNode, preset: SynthPreset) {
    this.preset = preset
    this.osc = ctx.createOscillator()
    this.osc.type = preset.osc
    this.filter = ctx.createBiquadFilter()
    this.filter.type = 'lowpass'
    this.filter.Q.value = preset.q
    this.amp = ctx.createGain()
    this.amp.gain.value = 0

    this.osc.connect(this.filter)
    if (preset.osc2) {
      this.osc2 = ctx.createOscillator()
      this.osc2.type = preset.osc2
      this.osc2.detune.value = preset.detune2 ?? 0
      this.osc2.connect(this.filter)
    }
    if (preset.fm) {
      this.fmOsc = ctx.createOscillator()
      this.fmOsc.type = 'sine'
      this.fmGain = ctx.createGain()
      this.fmGain.gain.value = preset.fm.depth
      this.fmOsc.connect(this.fmGain)
      this.fmGain.connect(this.osc.frequency)
    }
    // vibrato LFO
    this.vibrato = ctx.createOscillator()
    this.vibrato.frequency.value = 5.5
    this.vibratoGain = ctx.createGain()
    this.vibratoGain.gain.value = 0
    this.vibrato.connect(this.vibratoGain)
    this.vibratoGain.connect(this.osc.frequency)
    if (this.osc2) this.vibratoGain.connect(this.osc2.frequency)

    this.filter.connect(this.amp)
    this.amp.connect(dest)

    this.osc.start()
    this.osc2?.start()
    this.fmOsc?.start()
    this.vibrato.start()
  }

  set(ctx: AudioContext, freq: number, cutoff: number, vibratoDepth: number, vol: number, gateOn: boolean) {
    const t = ctx.currentTime
    this.osc.frequency.setTargetAtTime(freq, t, 0.03)
    this.osc2?.frequency.setTargetAtTime(freq, t, 0.03)
    if (this.fmOsc && this.preset.fm) {
      this.fmOsc.frequency.setTargetAtTime(freq * this.preset.fm.ratio, t, 0.03)
    }
    this.filter.frequency.setTargetAtTime(cutoff, t, 0.04)
    this.vibratoGain.gain.setTargetAtTime(vibratoDepth, t, 0.05)
    if (gateOn) {
      if (!this.gated) {
        this.amp.gain.cancelScheduledValues(t)
        this.amp.gain.setTargetAtTime(vol, t, this.preset.attack)
      } else {
        this.amp.gain.setTargetAtTime(vol, t, 0.04)
      }
      this.gated = true
    } else if (this.gated) {
      this.amp.gain.setTargetAtTime(0, t, this.preset.release)
      this.gated = false
    }
  }

  silence(ctx: AudioContext) {
    this.amp.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
    this.gated = false
  }

  dispose() {
    try {
      this.osc.stop(); this.osc2?.stop(); this.fmOsc?.stop(); this.vibrato.stop()
    } catch { /* already stopped */ }
  }
}

class HarmonyPad {
  voices: { osc: OscillatorNode; gain: GainNode }[] = []
  filter: BiquadFilterNode
  amp: GainNode
  active = false

  constructor(ctx: AudioContext, dest: AudioNode) {
    this.filter = ctx.createBiquadFilter()
    this.filter.type = 'lowpass'
    this.filter.frequency.value = 900
    this.filter.Q.value = 1.4
    this.amp = ctx.createGain()
    this.amp.gain.value = 0
    this.filter.connect(this.amp)
    this.amp.connect(dest)

    for (let i = 0; i < 4; i++) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = i === 0 ? 'sine' : 'triangle'
      osc.detune.value = [-7, 5, -3, 8][i]
      gain.gain.value = i === 0 ? 0.32 : 0.18
      osc.connect(gain)
      gain.connect(this.filter)
      osc.start()
      this.voices.push({ osc, gain })
    }
  }

  set(ctx: AudioContext, rootMidi: number, openness: number, brightness: number, on: boolean) {
    const t = ctx.currentTime
    const intervals = PROGRESSION[Math.floor(((rootMidi - 48) / 2 + 4) % PROGRESSION.length)].intervals
    for (let i = 0; i < this.voices.length; i++) {
      const semi = intervals[i % intervals.length]
      this.voices[i].osc.frequency.setTargetAtTime(midiToFreq(rootMidi + 12 + semi), t, 0.08)
    }
    this.filter.frequency.setTargetAtTime(500 + brightness * 4200, t, 0.12)
    this.amp.gain.setTargetAtTime(on ? 0.16 + openness * 0.22 : 0, t, on ? 0.12 : 0.22)
    this.active = on
  }

  silence(ctx: AudioContext) {
    this.amp.gain.setTargetAtTime(0, ctx.currentTime, 0.12)
    this.active = false
  }

  dispose() {
    for (const v of this.voices) {
      try { v.osc.stop() } catch { /* already stopped */ }
    }
  }
}

// ── drum kits ─────────────────────────────────────────────────
type KitId = '808' | 'acoustic' | 'click'
const KITS: { id: KitId; label: string }[] = [
  { id: '808', label: '808' },
  { id: 'acoustic', label: 'ACOUSTIC' },
  { id: 'click', label: 'CLICK' },
]

// ── the audio engine ──────────────────────────────────────────
const STEPS = 16
type Track = 'kick' | 'snare' | 'hat' | 'bass' | 'chord'
const TRACKS: Track[] = ['kick', 'snare', 'hat', 'bass', 'chord']

// soul/gospel progression in C minor — Cm7 · Abmaj7 · Ebmaj7 · Bb
// one chord per 4 steps. roots are semitone offsets from C.
const PROGRESSION: { root: number; intervals: number[] }[] = [
  { root: 0, intervals: [0, 3, 7, 10] }, // Cm7
  { root: 8, intervals: [0, 4, 7, 11] }, // Abmaj7
  { root: 3, intervals: [0, 4, 7, 11] }, // Ebmaj7
  { root: 10, intervals: [0, 4, 7, 10] }, // Bb7
]
const BASS_MIDI = 36 // C2
const CHORD_MIDI = 60 // C4

// half-time boom-bap groove with a moving 808 + chord stabs
const PRESET_PATTERN: Record<Track, boolean[]> = {
  kick: [true, false, false, false, false, false, true, false, false, false, true, false, false, false, false, false],
  snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
  hat: [true, false, true, false, true, false, true, true, true, false, true, false, true, false, true, true],
  bass: [true, false, false, false, false, false, true, false, false, true, true, false, false, false, true, false],
  chord: [true, false, false, false, false, false, false, false, true, false, false, false, false, true, false, false],
}

class AudioEngine {
  ctx: AudioContext | null = null
  master: GainNode | null = null
  drumBus: GainNode | null = null
  synthBus: GainNode | null = null
  pad: HarmonyPad | null = null
  delay: DelayNode | null = null
  feedback: GainNode | null = null
  wet: GainNode | null = null
  compressor: DynamicsCompressorNode | null = null
  voices: Voice[] = []
  preset = SYNTHS[0]
  kit: KitId = '808'
  private unregisterCapture: (() => void) | null = null

  // sequencer
  playing = false
  bpm = 86
  swing = 0.16 // 0..~0.3 — delays the off-beat 16ths for a hip-hop shuffle
  pattern: Record<Track, boolean[]> = {
    kick: [...PRESET_PATTERN.kick],
    snare: [...PRESET_PATTERN.snare],
    hat: [...PRESET_PATTERN.hat],
    bass: [...PRESET_PATTERN.bass],
    chord: [...PRESET_PATTERN.chord],
  }
  currentStep = 0
  private nextNoteTime = 0
  private schedulerId: number | null = null
  private lookahead = 0.1

  resume() {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.9
      this.compressor = this.ctx.createDynamicsCompressor()
      this.compressor.threshold.value = -18
      this.compressor.knee.value = 18
      this.compressor.ratio.value = 4
      this.compressor.attack.value = 0.006
      this.compressor.release.value = 0.18
      this.master.connect(this.compressor)
      this.compressor.connect(this.ctx.destination)

      // tap the master for the screen recorder
      const streamDest = this.ctx.createMediaStreamDestination()
      this.compressor.connect(streamDest)
      this.unregisterCapture = registerAudioStream(streamDest.stream)

      this.drumBus = this.ctx.createGain()
      this.drumBus.gain.value = 0.9
      this.drumBus.connect(this.master)

      this.synthBus = this.ctx.createGain()
      this.synthBus.gain.value = 1
      // delay send (controlled by hand distance)
      this.delay = this.ctx.createDelay(1)
      this.delay.delayTime.value = 0.28
      this.feedback = this.ctx.createGain()
      this.feedback.gain.value = 0.35
      this.wet = this.ctx.createGain()
      this.wet.gain.value = 0
      this.synthBus.connect(this.master)
      this.synthBus.connect(this.delay)
      this.delay.connect(this.feedback)
      this.feedback.connect(this.delay)
      this.delay.connect(this.wet)
      this.wet.connect(this.master)

      this.buildVoices()
      this.pad = new HarmonyPad(this.ctx, this.synthBus)
    }
    void this.ctx.resume()
  }

  private buildVoices() {
    if (!this.ctx || !this.synthBus) return
    this.voices.forEach((v) => v.dispose())
    this.voices = [new Voice(this.ctx, this.synthBus, this.preset), new Voice(this.ctx, this.synthBus, this.preset)]
  }

  setPreset(p: SynthPreset) {
    this.preset = p
    this.buildVoices()
  }
  setKit(k: KitId) { this.kit = k }
  setBpm(b: number) { this.bpm = b }

  setMuted(muted: boolean) {
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.05)
  }

  /** hand-distance macro: 0..1 → delay wet mix + voice detune spread */
  setMacro(amount: number) {
    if (!this.ctx || !this.wet) return
    this.wet.gain.setTargetAtTime(amount * 0.5, this.ctx.currentTime, 0.1)
  }

  /** drive voice i. amt is pinch closeness 0..1 used for volume/expression */
  playVoice(i: number, freq: number, cutoff: number, vibrato: number, vol: number, gateOn: boolean) {
    if (!this.ctx) return
    const v = this.voices[i]
    if (!v) return
    v.set(this.ctx, freq, cutoff, vibrato, vol, gateOn)
  }
  silenceVoice(i: number) {
    if (!this.ctx) return
    this.voices[i]?.silence(this.ctx)
  }
  setPad(rootMidi: number, openness: number, brightness: number, on: boolean) {
    if (!this.ctx) return
    this.pad?.set(this.ctx, rootMidi, openness, brightness, on)
  }
  silencePad() {
    if (!this.ctx) return
    this.pad?.silence(this.ctx)
  }

  // ── sequencer transport ──
  startSeq() {
    if (!this.ctx || this.playing) return
    this.playing = true
    this.currentStep = 0
    this.nextNoteTime = this.ctx.currentTime + 0.05
    this.scheduler()
  }
  stopSeq() {
    this.playing = false
    if (this.schedulerId !== null) { clearTimeout(this.schedulerId); this.schedulerId = null }
  }

  private scheduler = () => {
    if (!this.ctx || !this.playing) return
    const secPerStep = 60 / this.bpm / 4 // 16th notes
    while (this.nextNoteTime < this.ctx.currentTime + this.lookahead) {
      // swing: push the odd 16th notes later for a shuffled groove
      const swingOffset = this.currentStep % 2 === 1 ? secPerStep * this.swing : 0
      this.scheduleStep(this.currentStep, this.nextNoteTime + swingOffset)
      this.nextNoteTime += secPerStep
      this.currentStep = (this.currentStep + 1) % STEPS
    }
    this.schedulerId = window.setTimeout(this.scheduler, 25)
  }

  private scheduleStep(step: number, time: number) {
    for (const tr of TRACKS) {
      if (this.pattern[tr][step]) this.trigger(tr, time, step)
    }
  }

  private trigger(track: Track, time: number, step: number) {
    if (!this.ctx || !this.drumBus) return
    const ctx = this.ctx
    const out = this.drumBus
    if (track === 'kick') this.kick(ctx, out, time)
    else if (track === 'snare') this.snare(ctx, out, time)
    else if (track === 'hat') this.hat(ctx, out, time)
    else if (track === 'bass') this.bass(ctx, out, time, step)
    else this.chordStab(ctx, time, step)
  }

  private noise(ctx: AudioContext, dur: number) {
    const len = Math.ceil(ctx.sampleRate * dur)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    return src
  }

  private kick(ctx: AudioContext, out: AudioNode, t: number) {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    const start = this.kit === '808' ? 150 : this.kit === 'acoustic' ? 180 : 320
    const end = this.kit === 'click' ? 120 : 45
    const dur = this.kit === '808' ? 0.55 : 0.3
    o.frequency.setValueAtTime(start, t)
    o.frequency.exponentialRampToValueAtTime(end, t + dur)
    g.gain.setValueAtTime(1, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(g); g.connect(out)
    o.start(t); o.stop(t + dur + 0.02)
  }

  private snare(ctx: AudioContext, out: AudioNode, t: number) {
    const dur = this.kit === 'acoustic' ? 0.2 : 0.16
    const n = this.noise(ctx, dur)
    const nf = ctx.createBiquadFilter()
    nf.type = 'highpass'
    nf.frequency.value = this.kit === 'click' ? 3000 : 1500
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(this.kit === 'click' ? 0.4 : 0.7, t)
    ng.gain.exponentialRampToValueAtTime(0.001, t + dur)
    n.connect(nf); nf.connect(ng); ng.connect(out)
    n.start(t); n.stop(t + dur)
    if (this.kit !== 'click') {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'triangle'
      o.frequency.setValueAtTime(this.kit === 'acoustic' ? 220 : 180, t)
      g.gain.setValueAtTime(0.5, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
      o.connect(g); g.connect(out)
      o.start(t); o.stop(t + 0.13)
    }
  }

  private hat(ctx: AudioContext, out: AudioNode, t: number) {
    const dur = this.kit === 'acoustic' ? 0.06 : 0.04
    const n = this.noise(ctx, dur)
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 7000
    const g = ctx.createGain()
    g.gain.setValueAtTime(this.kit === 'click' ? 0.25 : 0.4, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    n.connect(hp); hp.connect(g); g.connect(out)
    n.start(t); n.stop(t + dur)
  }

  // 808-style sub bass: pitch-glides down into the chord root, long decay
  private bass(ctx: AudioContext, out: AudioNode, t: number, step: number) {
    const { root } = PROGRESSION[Math.floor(step / 4) % PROGRESSION.length]
    const f = midiToFreq(BASS_MIDI + root)
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    const drive = ctx.createWaveShaper()
    // gentle saturation for that 808 growl
    const curve = new Float32Array(257)
    for (let i = 0; i < 257; i++) {
      const x = (i / 256) * 2 - 1
      curve[i] = Math.tanh(x * 2.2)
    }
    drive.curve = curve
    o.type = 'sine'
    o.frequency.setValueAtTime(f * 2, t)
    o.frequency.exponentialRampToValueAtTime(f, t + 0.07) // pitch glide
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(1.1, t + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
    o.connect(drive); drive.connect(g); g.connect(out)
    o.start(t); o.stop(t + 0.55)
  }

  // soul chord stab: detuned triad through a sweeping filter, sent to delay
  private chordStab(ctx: AudioContext, t: number, step: number) {
    if (!this.drumBus || !this.delay) return
    const { root, intervals } = PROGRESSION[Math.floor(step / 4) % PROGRESSION.length]
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.Q.value = 2
    filter.frequency.setValueAtTime(700, t)
    filter.frequency.exponentialRampToValueAtTime(2600, t + 0.04)
    filter.frequency.exponentialRampToValueAtTime(500, t + 0.6)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.015)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7)
    filter.connect(g)
    g.connect(this.drumBus)
    g.connect(this.delay) // a little space behind the chops
    for (const semi of intervals) {
      const midi = CHORD_MIDI + root + semi
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator()
        o.type = 'triangle'
        o.frequency.value = midiToFreq(midi)
        o.detune.value = det
        o.connect(filter)
        o.start(t)
        o.stop(t + 0.72)
      }
    }
  }

  dispose() {
    this.stopSeq()
    this.unregisterCapture?.()
    this.unregisterCapture = null
    this.voices.forEach((v) => v.dispose())
    this.pad?.dispose()
    this.pad = null
    void this.ctx?.close()
    this.ctx = null
  }
}

// ── geometry helpers (mirrored to canvas px) ──────────────────
interface Pt { x: number; y: number }
function mp(lm: NormalizedLandmark, w: number, h: number): Pt {
  return { x: (1 - lm.x) * w, y: lm.y * h }
}
function dist(a: Pt, b: Pt) { return Math.hypot(a.x - b.x, a.y - b.y) }

interface HandState {
  index: Pt
  thumb: Pt
  wrist: Pt
  palm: Pt
  pinch: number // 0..1 closeness (1 = fully pinched)
  spread: number // finger spread for vibrato
  openness: number
  midi: number
  freq: number
  gateOn: boolean
  padOn: boolean
}

const FONT = 'ui-monospace, SFMono-Regular, Menlo, monospace'

function Scene({ video, paused }: { video: HTMLVideoElement } & ExperimentProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const engineRef = useRef(new AudioEngine())
  const handsRef = useRef<HandState[]>([])
  const lastDetect = useRef(0)
  const macroRef = useRef(0)

  const [muted, setMuted] = useState(false)
  const [synthId, setSynthId] = useState(SYNTHS[0].id)
  const [kitId, setKitId] = useState<KitId>('808')
  const [rootMidi, setRootMidi] = useState<number>(ROOTS[0].midi)
  const [scaleId, setScaleId] = useState<ScaleId>('minor-pent')
  const [playing, setPlaying] = useState(false)
  const [bpm, setBpm] = useState(86)
  // pattern mirrored to React for the grid UI
  const [pattern, setPattern] = useState<Record<Track, boolean[]>>(() => ({
    kick: [...PRESET_PATTERN.kick],
    snare: [...PRESET_PATTERN.snare],
    hat: [...PRESET_PATTERN.hat],
    bass: [...PRESET_PATTERN.bass],
    chord: [...PRESET_PATTERN.chord],
  }))
  const [playhead, setPlayhead] = useState(-1)

  useEffect(() => {
    const el = videoRef.current
    if (el && video.srcObject) { el.srcObject = video.srcObject; void el.play() }
  }, [video])

  useEffect(() => {
    let alive = true
    void createHandLandmarker(2).then((lm) => {
      if (alive) landmarkerRef.current = lm
      else lm.close()
    })
    const engine = engineRef.current
    return () => {
      alive = false
      landmarkerRef.current?.close()
      landmarkerRef.current = null
      engine.dispose()
    }
  }, [])

  useEffect(() => { engineRef.current.setMuted(muted || paused) }, [muted, paused])
  useEffect(() => {
    const p = SYNTHS.find((s) => s.id === synthId) ?? SYNTHS[0]
    if (engineRef.current.ctx) engineRef.current.setPreset(p)
    else engineRef.current.preset = p
  }, [synthId])
  useEffect(() => { engineRef.current.setKit(kitId) }, [kitId])
  useEffect(() => { engineRef.current.setBpm(bpm) }, [bpm])

  // re-render the playhead ~15fps while playing
  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => setPlayhead(engineRef.current.currentStep), 66)
    return () => clearInterval(id)
  }, [playing])

  const toggleStep = (track: Track, step: number) => {
    engineRef.current.resume()
    setPattern((prev) => {
      const next = { ...prev, [track]: prev[track].map((v, i) => (i === step ? !v : v)) }
      engineRef.current.pattern[track] = next[track]
      return next
    })
  }

  const togglePlay = () => {
    engineRef.current.resume()
    if (playing) { engineRef.current.stopSeq(); setPlaying(false) }
    else { engineRef.current.startSeq(); setPlaying(true) }
  }

  // ── main render/detect loop ──
  useEffect(() => {
    let raf = 0
    let lastRender = 0
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (now - lastRender < 15) return // cap ~60fps (high-refresh displays)
      lastRender = now
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return
      const rect = canvas.getBoundingClientRect()
      const w = Math.max(1, Math.floor(rect.width))
      const h = Math.max(1, Math.floor(rect.height))
      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h

      const engine = engineRef.current

      // detect ~33fps
      if (!paused && landmarkerRef.current && video.readyState >= 2 && now - lastDetect.current > 30) {
        lastDetect.current = now
        const res = landmarkerRef.current.detectForVideo(video, now)
        const states: HandState[] = res.landmarks.map((hand) => {
          const index = mp(hand[8], w, h)
          const thumb = mp(hand[4], w, h)
          const wrist = mp(hand[0], w, h)
          const palm = mp(hand[9], w, h)
          const middle = mp(hand[12], w, h)
          const ring = mp(hand[16], w, h)
          const pinky = mp(hand[20], w, h)
          const handSize = dist(wrist, mp(hand[10], w, h)) || 1
          const pinchRaw = dist(index, thumb) / handSize
          const pinch = Math.max(0, Math.min(1, 1 - (pinchRaw - 0.25) / 0.6))
          const spread = Math.max(0, Math.min(1, dist(index, middle) / handSize - 0.2))
          const fingerFan = (dist(index, pinky) + dist(middle, ring)) / (handSize * 2.8)
          const openness = Math.max(0, Math.min(1, fingerFan - 0.25))
          const midi = quantizeX(index.x / w, rootMidi, scaleId)
          return {
            index,
            thumb,
            wrist,
            palm,
            pinch,
            spread,
            openness,
            midi,
            freq: midiToFreq(midi),
            gateOn: pinch > 0.4,
            padOn: pinch < 0.24 && openness > 0.35,
          }
        })
        states.sort((a, b) => a.index.x - b.index.x)
        handsRef.current = states
      }
      if (paused) handsRef.current = []

      const hands = handsRef.current

      // hand-distance macro
      if (hands.length === 2) {
        const d = dist(hands[0].index, hands[1].index) / w
        macroRef.current = Math.max(0, Math.min(1, d))
      } else {
        macroRef.current *= 0.9
      }
      engine.setMacro(macroRef.current)

      // drive voices
      for (let i = 0; i < 2; i++) {
        const hs = hands[i]
        if (hs && !paused) {
          const cutoff = engine.preset.baseCutoff + (1 - hs.index.y / h) * engine.preset.cutoffRange
          const vib = (hs.spread * 18) + (hs.gateOn ? 4 : 0)
          const vol = engine.preset.gain * (0.4 + hs.pinch * 0.6)
          engine.playVoice(i, hs.freq, cutoff, vib, vol, hs.gateOn)
        } else {
          engine.silenceVoice(i)
        }
      }
      const padHand = hands.find((hs) => hs.padOn)
      if (padHand && !paused) {
        const chordRoot = rootMidi + PROGRESSION[Math.max(0, Math.min(3, Math.floor((padHand.palm.x / w) * 4)))].root
        engine.setPad(chordRoot, padHand.openness, 1 - padHand.palm.y / h, true)
      } else {
        engine.silencePad()
      }

      // ── draw HUD ──
      ctx.clearRect(0, 0, w, h)

      // scale ladder (vertical grid lines per scale step)
      ctx.font = `11px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const activeScale = SCALES.find((s) => s.id === scaleId)?.steps ?? SCALES[0].steps
      for (let s = 0; s < activeScale.length; s++) {
        const x = (s / (activeScale.length - 1)) * w
        ctx.strokeStyle = 'rgba(80, 255, 160, 0.10)'
        ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(x, 28); ctx.lineTo(x, h - 90); ctx.stroke()
        ctx.fillStyle = 'rgba(80, 255, 160, 0.35)'
        ctx.fillText(midiToName(rootMidi + activeScale[s]), x, h - 80)
      }

      // hands
      ctx.textAlign = 'left'
      hands.forEach((hs, i) => {
        const color = hs.gateOn ? '#7dffb0' : 'rgba(125,255,176,0.45)'
        // pinch connector
        ctx.strokeStyle = color
        ctx.lineWidth = hs.gateOn ? 2.5 : 1
        ctx.beginPath(); ctx.moveTo(hs.index.x, hs.index.y); ctx.lineTo(hs.thumb.x, hs.thumb.y); ctx.stroke()
        // index marker
        ctx.fillStyle = color
        ctx.font = `${hs.gateOn ? 18 : 14}px ${FONT}`
        ctx.textAlign = 'center'
        ctx.fillText(hs.gateOn ? '◉' : '○', hs.index.x, hs.index.y)
        ctx.fillText('+', hs.thumb.x, hs.thumb.y)
        if (hs.padOn) {
          ctx.strokeStyle = 'rgba(120,200,255,0.58)'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(hs.palm.x, hs.palm.y, 34 + hs.openness * 28, 0, Math.PI * 2)
          ctx.stroke()
          ctx.fillStyle = 'rgba(120,200,255,0.85)'
          ctx.font = `13px ${FONT}`
          ctx.fillText('PAD', hs.palm.x, hs.palm.y)
        }
        // label
        ctx.textAlign = 'left'
        ctx.font = `12px ${FONT}`
        ctx.fillStyle = '#aaffcc'
        const label = `H${i + 1} ${midiToName(hs.midi)}  ${hs.freq.toFixed(0)}Hz`
        ctx.fillText(label, hs.index.x + 14, hs.index.y - 12)
        ctx.fillStyle = 'rgba(170,255,204,0.6)'
        ctx.fillText(`pinch ${(hs.pinch * 100) | 0}%  ${hs.gateOn ? 'ON' : 'off'}`, hs.index.x + 14, hs.index.y + 6)
      })

      // distance line + macro readout
      if (hands.length === 2) {
        ctx.strokeStyle = `rgba(120,200,255,${0.2 + macroRef.current * 0.5})`
        ctx.setLineDash([4, 6]); ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(hands[0].index.x, hands[0].index.y); ctx.lineTo(hands[1].index.x, hands[1].index.y); ctx.stroke()
        ctx.setLineDash([])
      }

      // top HUD
      ctx.textAlign = 'left'
      ctx.font = `12px ${FONT}`
      ctx.fillStyle = '#7dffb0'
      ctx.fillText('◤ HAND INSTRUMENT ◢  pinch=lead · open palm=pad · X=pitch/chord · Y=brightness', 14, 18)
      ctx.fillStyle = 'rgba(120,200,255,0.85)'
      ctx.fillText(`hand-distance macro [delay/space]: ${(macroRef.current * 100) | 0}%`, 14, h - 58)
      ctx.fillStyle = hands.length ? '#7dffb0' : 'rgba(125,255,176,0.4)'
      ctx.fillText(hands.length ? `${hands.length} hand(s) tracked` : 'show your hands to the camera', 14, h - 40)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [paused, rootMidi, scaleId, video])

  const btn = 'rounded border px-2 py-1 font-mono text-[11px] transition'
  const btnOff = 'border-white/20 text-white/55 hover:text-white/90 hover:border-white/40'
  const btnOn = 'border-emerald-400/70 text-emerald-300 bg-emerald-400/10'

  return (
    <div
      className="relative h-full min-h-[560px] w-full overflow-hidden rounded border border-lab-line bg-black"
      onPointerDown={() => engineRef.current.resume()}
    >
      <video
        ref={videoRef}
        playsInline
        muted
        className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* synth + key select */}
      <div className="absolute left-3 top-9 flex max-w-[min(760px,calc(100%-1.5rem))] flex-wrap gap-1.5">
        {SYNTHS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => { engineRef.current.resume(); setSynthId(s.id) }}
            className={`${btn} ${synthId === s.id ? btnOn : btnOff} bg-black/40 backdrop-blur`}
          >
            {s.label}
          </button>
        ))}
        <span className="mx-1 h-7 border-l border-white/15" />
        {ROOTS.map((r) => (
          <button
            key={r.name}
            type="button"
            onClick={() => { engineRef.current.resume(); setRootMidi(r.midi) }}
            className={`${btn} ${rootMidi === r.midi ? btnOn : btnOff} bg-black/40 backdrop-blur`}
          >
            {r.name}
          </button>
        ))}
        {SCALES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => { engineRef.current.resume(); setScaleId(s.id) }}
            className={`${btn} ${scaleId === s.id ? btnOn : btnOff} bg-black/40 backdrop-blur`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* drum machine panel */}
      <div className="absolute inset-x-3 bottom-3 rounded border border-white/15 bg-black/55 p-2 backdrop-blur">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={togglePlay} className={`${btn} ${playing ? btnOn : btnOff} bg-black/40`}>
            {playing ? '■ STOP' : '► PLAY'}
          </button>
          <div className="flex items-center gap-1 font-mono text-[11px] text-white/55">
            <span>BPM</span>
            <input
              type="range" min={70} max={170} value={bpm}
              onChange={(e) => setBpm(Number(e.target.value))}
              className="h-1 w-24 accent-emerald-400"
            />
            <span className="w-7 text-emerald-300">{bpm}</span>
          </div>
          <div className="flex gap-1.5">
            {KITS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => { engineRef.current.resume(); setKitId(k.id) }}
                className={`${btn} ${kitId === k.id ? btnOn : btnOff} bg-black/40`}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>
        {TRACKS.map((track) => (
          <div key={track} className="mb-1 flex items-center gap-1">
            <span className="w-12 font-mono text-[10px] uppercase text-white/45">{track}</span>
            <div className="flex flex-1 gap-0.5">
              {pattern[track].map((on, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleStep(track, i)}
                  className={`h-5 flex-1 rounded-sm border text-[0px] transition ${
                    on ? 'border-emerald-400/70 bg-emerald-400/70' : 'border-white/15 bg-white/5'
                  } ${playing && i === playhead ? 'ring-1 ring-cyan-300' : ''} ${i % 4 === 0 ? 'ml-1 first:ml-0' : ''}`}
                  aria-label={`${track} step ${i + 1}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <SoundToggle muted={muted} onToggle={() => setMuted((v) => !v)} />
    </div>
  )
}

export default function PinchTheremin({ paused }: ExperimentProps) {
  return (
    <WebcamGate hint="pinch for lead notes, open your palm for harmony, then perform over the beat machine">
      {(video) => <Scene video={video} paused={paused} />}
    </WebcamGate>
  )
}

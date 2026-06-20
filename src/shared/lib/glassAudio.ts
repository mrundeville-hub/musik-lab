/**
 * Generative glass/digital sound engine (Web Audio, no samples).
 *
 * Aesthetic: art-installation sound design — FM glass bells with
 * inharmonic partials, a long shimmering convolution reverb, a quiet
 * evolving drone pad, and tiny digital "sparkle" grains. Everything
 * routes through a master gain so it can be muted as one unit.
 *
 * Caller owns dispose().
 */

import { registerAudioStream } from '@/shared/lib/audioCapture'

// pentatonic-ish set that stays consonant at any combination (D major add9 field)
export const GLASS_SCALE = [293.66, 369.99, 440.0, 554.37, 659.25, 880.0]

function makeShimmerImpulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate
  const len = Math.floor(rate * seconds)
  const buf = ctx.createBuffer(2, len, rate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) {
      const t = i / len
      // exponential decay + slow comb-like modulation = glassy, not "room"
      const env = Math.pow(1 - t, 2.8)
      const comb = 0.7 + 0.3 * Math.sin(i * 0.013 + ch * 1.7)
      d[i] = (Math.random() * 2 - 1) * env * comb
    }
  }
  return buf
}

export class GlassAudio {
  private ctx: AudioContext
  private master: GainNode
  private wet: GainNode
  private padOscs: OscillatorNode[] = []
  private padGain: GainNode
  private padFilter: BiquadFilterNode
  private lfos: OscillatorNode[] = []
  private disposed = false
  private unregisterCapture: (() => void) | null = null

  constructor() {
    this.ctx = new AudioContext()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.5
    this.master.connect(this.ctx.destination)

    // tap the master for the screen recorder
    const streamDest = this.ctx.createMediaStreamDestination()
    this.master.connect(streamDest)
    this.unregisterCapture = registerAudioStream(streamDest.stream)

    // shimmer reverb bus
    const convolver = this.ctx.createConvolver()
    convolver.buffer = makeShimmerImpulse(this.ctx, 4)
    this.wet = this.ctx.createGain()
    this.wet.gain.value = 0.55
    this.wet.connect(convolver)
    convolver.connect(this.master)

    // evolving drone pad: detuned sine cluster, very quiet, slowly breathing
    this.padGain = this.ctx.createGain()
    this.padGain.gain.value = 0
    this.padFilter = this.ctx.createBiquadFilter()
    this.padFilter.type = 'bandpass'
    this.padFilter.frequency.value = 600
    this.padFilter.Q.value = 1.2
    this.padGain.connect(this.padFilter)
    this.padFilter.connect(this.master)
    this.padFilter.connect(this.wet)

    const base = GLASS_SCALE[0]
    for (const [mult, detune] of [
      [1, 0],
      [1, 6],
      [1.5, -4],
      [2, 3],
    ] as const) {
      const osc = this.ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = base * mult
      osc.detune.value = detune
      osc.connect(this.padGain)
      osc.start()
      this.padOscs.push(osc)
    }

    // slow LFO breathing the pad filter
    const lfo = this.ctx.createOscillator()
    lfo.frequency.value = 0.07
    const lfoAmt = this.ctx.createGain()
    lfoAmt.gain.value = 280
    lfo.connect(lfoAmt)
    lfoAmt.connect(this.padFilter.frequency)
    lfo.start()
    this.lfos.push(lfo)
  }

  /** Resume after user gesture (autoplay policy). */
  resume() {
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  setMuted(muted: boolean) {
    this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.1)
  }

  /** Pad level 0..1 — the ambient bed under everything. */
  setPadLevel(level: number) {
    this.padGain.gain.setTargetAtTime(level * 0.05, this.ctx.currentTime, 0.8)
  }

  /** Shift the pad's spectral centre (0..1 → dark..bright). */
  setPadBrightness(v: number) {
    this.padFilter.frequency.setTargetAtTime(
      300 + v * 1500,
      this.ctx.currentTime,
      0.5,
    )
  }

  /**
   * FM glass bell — inharmonic modulator gives the digital-glass timbre.
   * @param freq carrier Hz
   * @param opts.bright 0..1 — FM index (how "glassy/metallic")
   * @param opts.dur seconds of decay
   * @param opts.gain 0..1
   * @param opts.pan -1..1
   */
  bell(
    freq: number,
    opts: { bright?: number; dur?: number; gain?: number; pan?: number } = {},
  ) {
    if (this.disposed) return
    const { bright = 0.5, dur = 2.2, gain = 0.5, pan = 0 } = opts
    const t = this.ctx.currentTime

    const carrier = this.ctx.createOscillator()
    carrier.frequency.value = freq

    // inharmonic FM ratio ~2.76 → glass bowl spectrum
    const mod = this.ctx.createOscillator()
    mod.frequency.value = freq * 2.756
    const modGain = this.ctx.createGain()
    modGain.gain.setValueAtTime(freq * (0.8 + bright * 2.4), t)
    modGain.gain.exponentialRampToValueAtTime(freq * 0.01, t + dur * 0.7)
    mod.connect(modGain)
    modGain.connect(carrier.frequency)

    const env = this.ctx.createGain()
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(gain * 0.22, t + 0.008)
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur)

    const panner = this.ctx.createStereoPanner()
    panner.pan.value = pan

    carrier.connect(env)
    env.connect(panner)
    panner.connect(this.master)
    panner.connect(this.wet)

    carrier.start(t)
    mod.start(t)
    carrier.stop(t + dur + 0.1)
    mod.stop(t + dur + 0.1)
  }

  /** Tiny high digital sparkle grain — pure sine blip into the reverb only. */
  sparkle(pan = 0) {
    if (this.disposed) return
    const t = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    osc.frequency.value = 2000 + Math.random() * 3500
    const env = this.ctx.createGain()
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(0.04, t + 0.004)
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
    const panner = this.ctx.createStereoPanner()
    panner.pan.value = pan
    osc.connect(env)
    env.connect(panner)
    panner.connect(this.wet) // wet-only: sparkles live inside the reverb
    osc.start(t)
    osc.stop(t + 0.2)
  }

  /**
   * Soft consonant glass chord (root + fifth + octave + add9 shimmer).
   * Lush, long-decaying — for landings / accents.
   */
  chord(
    root: number,
    opts: { bright?: number; dur?: number; gain?: number; pan?: number } = {},
  ) {
    if (this.disposed) return
    const { bright = 0.6, dur = 3.4, gain = 0.42, pan = 0 } = opts
    // ratios stay consonant for any root: root, fifth, octave, octave+major-third
    const voices: [number, number, number][] = [
      [1, 1, 0],
      [1.5, 0.78, -0.25],
      [2, 0.6, 0.25],
      [2.5, 0.4, 0.12],
    ]
    voices.forEach(([mult, g, p], i) => {
      setTimeout(
        () => this.bell(root * mult, { bright, dur: dur * (1 - i * 0.08), gain: gain * g, pan: pan + p }),
        i * 28,
      )
    })
  }

  /** Ascending 3-note glass flourish (e.g. take-off). */
  flourish(up = true) {
    const notes = up
      ? [GLASS_SCALE[1], GLASS_SCALE[3], GLASS_SCALE[5]]
      : [GLASS_SCALE[4], GLASS_SCALE[2], GLASS_SCALE[0]]
    notes.forEach((f, i) => {
      setTimeout(() => this.bell(f, { bright: 0.7, dur: 1.6, gain: 0.4 }), i * 90)
    })
  }

  dispose() {
    this.disposed = true
    this.unregisterCapture?.()
    this.unregisterCapture = null
    for (const o of [...this.padOscs, ...this.lfos]) {
      try {
        o.stop()
      } catch {
        /* already stopped */
      }
    }
    void this.ctx.close()
  }
}

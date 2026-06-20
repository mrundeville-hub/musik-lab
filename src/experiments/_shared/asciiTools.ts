import { registerAudioStream } from '@/shared/lib/audioCapture'

export interface StageSize {
  width: number
  height: number
  dpr: number
}

export interface Point {
  x: number
  y: number
}

export function resizeCanvas(canvas: HTMLCanvasElement): StageSize {
  const rect = canvas.getBoundingClientRect()
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const width = Math.max(1, Math.floor(rect.width))
  const height = Math.max(1, Math.floor(rect.height))
  const pixelWidth = Math.floor(width * dpr)
  const pixelHeight = Math.floor(height * dpr)

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth
    canvas.height = pixelHeight
  }

  const ctx = canvas.getContext('2d')
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)

  return { width, height, dpr }
}

export function mirroredPoint(point: { x: number; y: number }, width: number, height: number): Point {
  return {
    x: (1 - point.x) * width,
    y: point.y * height,
  }
}

export function clearInk(ctx: CanvasRenderingContext2D, width: number, height: number, alpha = 1) {
  ctx.fillStyle = `rgba(7, 8, 10, ${alpha})`
  ctx.fillRect(0, 0, width, height)
}

export function drawDimWebcam(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
  alpha = 0.16,
) {
  if (video.readyState < 2) return
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(width, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(video, 0, 0, width, height)
  ctx.restore()
}

export function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.fillStyle = 'rgba(226, 232, 240, 0.68)'
  ctx.fillText(text, x, y)
}

export function line(ctx: CanvasRenderingContext2D, a: Point, b: Point, color: string, width = 1) {
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.stroke()
}

export function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export class TinyAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private muted = false
  private unregisterCapture: (() => void) | null = null

  resume() {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.muted ? 0 : 0.28
      this.master.connect(this.ctx.destination)
      // tap the master for the screen recorder
      const streamDest = this.ctx.createMediaStreamDestination()
      this.master.connect(streamDest)
      this.unregisterCapture = registerAudioStream(streamDest.stream)
    }
    void this.ctx.resume()
  }

  setMuted(muted: boolean) {
    this.muted = muted
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.28, this.ctx.currentTime, 0.05)
    }
  }

  tone(freq: number, gain = 0.08, dur = 0.18, type: OscillatorType = 'sine', pan = 0) {
    if (!this.ctx || !this.master || this.muted) return
    const now = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const amp = this.ctx.createGain()
    const panner = this.ctx.createStereoPanner()
    osc.type = type
    osc.frequency.setValueAtTime(freq, now)
    amp.gain.setValueAtTime(0.0001, now)
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + 0.015)
    amp.gain.exponentialRampToValueAtTime(0.0001, now + dur)
    panner.pan.value = Math.max(-1, Math.min(1, pan))
    osc.connect(amp)
    amp.connect(panner)
    panner.connect(this.master)
    osc.start(now)
    osc.stop(now + dur + 0.03)
  }

  noise(gain = 0.05, dur = 0.2, pan = 0) {
    if (!this.ctx || !this.master || this.muted) return
    const now = this.ctx.currentTime
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
    const source = this.ctx.createBufferSource()
    const amp = this.ctx.createGain()
    const filter = this.ctx.createBiquadFilter()
    const panner = this.ctx.createStereoPanner()
    source.buffer = buffer
    filter.type = 'highpass'
    filter.frequency.value = 1200
    amp.gain.value = gain
    panner.pan.value = Math.max(-1, Math.min(1, pan))
    source.connect(filter)
    filter.connect(amp)
    amp.connect(panner)
    panner.connect(this.master)
    source.start(now)
  }

  dispose() {
    this.unregisterCapture?.()
    this.unregisterCapture = null
    void this.ctx?.close()
    this.ctx = null
    this.master = null
  }
}

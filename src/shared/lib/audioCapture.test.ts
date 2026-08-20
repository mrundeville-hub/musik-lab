import { describe, expect, it, vi } from 'vitest'
import {
  ensureCaptureAudioReady,
  getCaptureAudioTracks,
  onCaptureWake,
  registerAudioStream,
} from './audioCapture'

function fakeStream(tracks: MediaStreamTrack[] = []): MediaStream {
  return { getAudioTracks: () => tracks } as MediaStream
}

function fakeTrack(id: string): MediaStreamTrack {
  return { id } as MediaStreamTrack
}

describe('audioCapture bridge', () => {
  it('registers streams and returns tracks', () => {
    const a = fakeTrack('a')
    const b = fakeTrack('b')
    const off = registerAudioStream(fakeStream([a, b]))
    expect(getCaptureAudioTracks().map((t) => t.id)).toEqual(['a', 'b'])
    off()
    expect(getCaptureAudioTracks()).toEqual([])
  })

  it('unregister removes only that stream', () => {
    const off1 = registerAudioStream(fakeStream([fakeTrack('1')]))
    const off2 = registerAudioStream(fakeStream([fakeTrack('2')]))
    off1()
    expect(getCaptureAudioTracks().map((t) => t.id)).toEqual(['2'])
    off2()
    expect(getCaptureAudioTracks()).toEqual([])
  })

  it('wakes registered engines and cleans up', () => {
    const wake = vi.fn()
    const off = onCaptureWake(wake)
    ensureCaptureAudioReady()
    expect(wake).toHaveBeenCalledOnce()
    off()
    ensureCaptureAudioReady()
    expect(wake).toHaveBeenCalledOnce()
  })
})

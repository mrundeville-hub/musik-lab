/**
 * Bridges an experiment's Web Audio output into the screen recorder.
 *
 * Each audio engine connects its master to a MediaStreamAudioDestinationNode
 * and registers the resulting stream here. useRecorder pulls the live audio
 * tracks when a recording starts, so exported clips include the sound.
 *
 * Only one experiment is mounted at a time, so there is normally a single
 * active stream; MediaRecorder records the first audio track regardless.
 */
const streams = new Set<MediaStream>()
const wakes = new Set<() => void>()

/** Register an audio stream; returns an unregister function for cleanup. */
export function registerAudioStream(stream: MediaStream): () => void {
  streams.add(stream)
  return () => {
    streams.delete(stream)
  }
}

/** Resume suspended audio engines — call from a user-gesture handler before recording. */
export function onCaptureWake(fn: () => void): () => void {
  wakes.add(fn)
  return () => {
    wakes.delete(fn)
  }
}

export function ensureCaptureAudioReady() {
  for (const fn of wakes) fn()
}

/** Live audio tracks to mix into a recording, newest first. */
export function getCaptureAudioTracks(): MediaStreamTrack[] {
  const tracks: MediaStreamTrack[] = []
  for (const s of streams) tracks.push(...s.getAudioTracks())
  return tracks
}

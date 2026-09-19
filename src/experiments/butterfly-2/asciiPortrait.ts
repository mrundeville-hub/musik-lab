export const ASCII_RAMP = ' .,:;irsXA253hMHGS#9B&@'

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

export function computeLuminance(data: Uint8ClampedArray, out: Float32Array) {
  for (let source = 0, target = 0; target < out.length; source += 4, target++) {
    out[target] =
      0.2126 * data[source] +
      0.7152 * data[source + 1] +
      0.0722 * data[source + 2]
  }
}

export function normalizeLuminance(value: number, black = 18, white = 225) {
  return clamp01((value - black) / Math.max(1, white - black)) ** 0.78
}

export function edgeStrength(
  luma: Float32Array,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  if (x <= 0 || y <= 0 || x >= width - 1 || y >= height - 1) return 0

  const at = (dx: number, dy: number) => luma[(y + dy) * width + x + dx]
  const gx =
    -at(-1, -1) +
    at(1, -1) -
    2 * at(-1, 0) +
    2 * at(1, 0) -
    at(-1, 1) +
    at(1, 1)
  const gy =
    -at(-1, -1) -
    2 * at(0, -1) -
    at(1, -1) +
    at(-1, 1) +
    2 * at(0, 1) +
    at(1, 1)

  return clamp01(Math.hypot(gx, gy) / 1020)
}

export function glyphIndex(value: number, edge: number, rampLength: number) {
  return Math.round(
    clamp01(value + Math.min(0.28, edge * 0.24)) * (rampLength - 1),
  )
}

export function waveCoverage(
  x: number,
  y: number,
  originX: number,
  originY: number,
  radius: number,
  feather = 80,
) {
  return clamp01(
    (radius + feather / 2 - Math.hypot(x - originX, y - originY)) / feather,
  )
}

export function maxCornerDistance(
  originX: number,
  originY: number,
  width: number,
  height: number,
) {
  return Math.max(
    Math.hypot(originX, originY),
    Math.hypot(width - originX, originY),
    Math.hypot(originX, height - originY),
    Math.hypot(width - originX, height - originY),
  )
}

export type TransitionMode = 'revealing' | 'hiding'

export function transitionRadius(
  mode: TransitionMode,
  elapsed: number,
  duration: number,
  maxRadius: number,
) {
  const t = clamp01(elapsed / duration)
  const eased =
    t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2
  return maxRadius * (mode === 'revealing' ? eased : 1 - eased)
}

export interface Point {
  x: number
  y: number
}

export function isPinching(
  thumb: Point,
  index: Point,
  middle: Point,
  handScale: number,
  wasPinching: boolean,
) {
  const on = Math.max(18, handScale * 0.32)
  const off = Math.max(28, handScale * 0.46)
  const distance = Math.min(
    distanceBetween(thumb, index),
    distanceBetween(index, middle),
  )
  return distance < (wasPinching ? off : on)
}

export function distanceBetween(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

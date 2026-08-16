import { describe, expect, it } from 'vitest'
import { classifyGesture, type Lm } from './classifyGesture'

/** Build a 21-point hand; override tips/joints as needed. */
function hand(partial: Record<number, Lm>): Lm[] {
  const pts: Lm[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }))
  for (const [i, p] of Object.entries(partial)) pts[Number(i)] = p
  return pts
}

function curledFist(): Lm[] {
  // All tips near palm (wrist/mcp cluster) → fist
  return hand({
    0: { x: 0.5, y: 0.7 },
    4: { x: 0.52, y: 0.62 },
    8: { x: 0.5, y: 0.58 },
    12: { x: 0.48, y: 0.58 },
    16: { x: 0.46, y: 0.6 },
    20: { x: 0.44, y: 0.62 },
    5: { x: 0.5, y: 0.55 },
    9: { x: 0.48, y: 0.55 },
    13: { x: 0.46, y: 0.55 },
    17: { x: 0.44, y: 0.55 },
  })
}

function indexUp(awayFromMouth = true): Lm[] {
  const tipY = awayFromMouth ? 0.15 : 0.38
  const pipY = awayFromMouth ? 0.4 : 0.48
  return hand({
    0: { x: 0.5, y: 0.75 },
    5: { x: 0.5, y: 0.55 },
    6: { x: 0.5, y: pipY },
    8: { x: 0.5, y: tipY }, // tip above PIP (smaller y) → extended
    4: { x: 0.42, y: 0.55 }, // thumb not shaka-far
    12: { x: 0.5, y: 0.52 },
    10: { x: 0.5, y: 0.5 },
    16: { x: 0.48, y: 0.54 },
    14: { x: 0.48, y: 0.52 },
    20: { x: 0.46, y: 0.56 },
    18: { x: 0.46, y: 0.54 },
  })
}

describe('classifyGesture', () => {
  it('returns null for empty hands', () => {
    expect(classifyGesture([], null)).toBeNull()
  })

  it('detects fist', () => {
    expect(classifyGesture([curledFist()], null)).toBe('fist')
  })

  it('detects pointUp when index up and tip far from mouth', () => {
    const mouth = { x: 0.5, y: 0.45 }
    expect(classifyGesture([indexUp(true)], mouth)).toBe('pointUp')
  })

  it('detects shush when index tip near mouth', () => {
    const mouth = { x: 0.5, y: 0.42 }
    expect(classifyGesture([indexUp(false)], mouth)).toBe('shush')
  })

  it('prefers shush over pointUp when one hand points up far from mouth and another shushes', () => {
    const mouth = { x: 0.5, y: 0.42 }
    expect(classifyGesture([indexUp(true), indexUp(false)], mouth)).toBe('shush')
  })

  it('detects shy when two index tips are close', () => {
    const left = hand({
      0: { x: 0.3, y: 0.7 },
      5: { x: 0.32, y: 0.5 },
      6: { x: 0.35, y: 0.4 },
      8: { x: 0.45, y: 0.35 },
      12: { x: 0.3, y: 0.5 },
      10: { x: 0.3, y: 0.48 },
      16: { x: 0.28, y: 0.52 },
      14: { x: 0.28, y: 0.5 },
      20: { x: 0.26, y: 0.54 },
      18: { x: 0.26, y: 0.52 },
      4: { x: 0.28, y: 0.55 },
    })
    const right = hand({
      0: { x: 0.7, y: 0.7 },
      5: { x: 0.68, y: 0.5 },
      6: { x: 0.65, y: 0.4 },
      8: { x: 0.5, y: 0.35 },
      12: { x: 0.7, y: 0.5 },
      10: { x: 0.7, y: 0.48 },
      16: { x: 0.72, y: 0.52 },
      14: { x: 0.72, y: 0.5 },
      20: { x: 0.74, y: 0.54 },
      18: { x: 0.74, y: 0.52 },
      4: { x: 0.72, y: 0.55 },
    })
    expect(classifyGesture([left, right], null)).toBe('shy')
  })
})

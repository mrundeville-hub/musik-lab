import { describe, expect, it } from 'vitest'
import {
  computeLuminance,
  edgeStrength,
  glyphIndex,
  maxCornerDistance,
  normalizeLuminance,
  transitionRadius,
  waveCoverage,
} from './asciiPortrait'

describe('ASCII portrait processing', () => {
  it('uses Rec. 709 luminance weights', () => {
    const out = new Float32Array(3)
    computeLuminance(
      new Uint8ClampedArray([
        255, 0, 0, 255,
        0, 255, 0, 255,
        0, 0, 255, 255,
      ]),
      out,
    )
    expect(out[0]).toBeCloseTo(54.213, 2)
    expect(out[1]).toBeCloseTo(182.376, 2)
    expect(out[2]).toBeCloseTo(18.411, 2)
  })

  it('clips black and white points and applies gamma', () => {
    expect(normalizeLuminance(20, 20, 220)).toBe(0)
    expect(normalizeLuminance(220, 20, 220)).toBe(1)
    expect(normalizeLuminance(100, 20, 220)).toBeGreaterThan(0.4)
  })

  it('detects a strong vertical edge', () => {
    const luma = new Float32Array([
      0, 0, 255,
      0, 0, 255,
      0, 0, 255,
    ])
    expect(edgeStrength(luma, 1, 1, 3, 3)).toBeGreaterThan(0.8)
  })

  it('edge detail raises the selected glyph density', () => {
    expect(glyphIndex(0.25, 1, 10)).toBeGreaterThan(glyphIndex(0.25, 0, 10))
  })

  it('feathers the radial wave edge', () => {
    expect(waveCoverage(0, 0, 0, 0, 100, 20)).toBe(1)
    expect(waveCoverage(100, 0, 0, 0, 100, 20)).toBeCloseTo(0.5)
    expect(waveCoverage(130, 0, 0, 0, 100, 20)).toBe(0)
  })

  it('covers the farthest stage corner', () => {
    expect(maxCornerDistance(0, 0, 300, 400)).toBe(500)
  })

  it('expands and contracts with clamped eased progress', () => {
    expect(transitionRadius('revealing', 0, 700, 500)).toBe(0)
    expect(transitionRadius('revealing', 700, 700, 500)).toBe(500)
    expect(transitionRadius('hiding', 0, 700, 500)).toBe(500)
    expect(transitionRadius('hiding', 700, 700, 500)).toBe(0)
    expect(transitionRadius('hiding', 0, 700, 500, 125)).toBe(125)
  })
})

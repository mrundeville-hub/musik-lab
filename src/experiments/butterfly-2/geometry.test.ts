import { describe, expect, it } from 'vitest'
import { buildCells, paintCells, wingField } from './geometry'

describe('butterfly wing geometry', () => {
  const cells = buildCells()
  const art = paintCells(cells)

  it('prints a swallowtail-like silhouette', () => {
    // Visible in vitest output when the assertion fails — also useful while iterating.
    expect(art.split('\n').length).toBeGreaterThan(20)
    expect(cells.length).toBeGreaterThan(700)
    expect(cells.length).toBeLessThan(1700)
  })

  it('has a pointed forewing apex (upper-outer cells)', () => {
    const apex = cells.filter((c) => !c.st && c.kind === 'fore' && c.row < -12 && Math.abs(c.col) > 14)
    expect(apex.length).toBeGreaterThan(8)
  })

  it('has hindwing tails below the abdomen', () => {
    const tails = cells.filter((c) => c.kind === 'tail' && c.row > 10)
    expect(tails.length).toBeGreaterThan(6)
  })

  it('has a dense eyespot on the hindwing', () => {
    const spot = wingField(0.5, 0.46)
    expect(spot.kind === 'hind' || spot.kind === 'tail').toBe(true)
    expect(spot.d).toBeGreaterThan(0.7)
  })

  it('has veins that are denser than surrounding scale', () => {
    const veins = cells.filter((c) => c.vein)
    expect(veins.length).toBeGreaterThan(40)
    const avgVein = veins.reduce((s, c) => s + c.d, 0) / veins.length
    const scales = cells.filter((c) => !c.st && !c.vein)
    const avgScale = scales.reduce((s, c) => s + c.d, 0) / scales.length
    expect(avgVein).toBeGreaterThan(avgScale)
  })

  it('spreads scale density across the ramp instead of clamping to solid', () => {
    // If the additive terms stack too high everything saturates at 1 and the
    // wing renders as a flat block of '@' — pattern, veins and lunules vanish.
    const wing = cells.filter((c) => !c.st)
    const solid = wing.filter((c) => c.d > 0.9).length / wing.length
    const light = wing.filter((c) => c.d < 0.5).length / wing.length
    expect(solid).toBeLessThan(0.35)
    expect(light).toBeGreaterThan(0.2)
  })

  it('mirrors left and right wings', () => {
    const left = cells.filter((c) => c.col < 0 && !c.st).length
    const right = cells.filter((c) => c.col > 0 && !c.st).length
    expect(left).toBe(right)
  })
})

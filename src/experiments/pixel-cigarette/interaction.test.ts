import { describe, expect, it } from 'vitest'

import { isPinching } from './interaction'

describe('pixel cigarette gesture', () => {
  it('accepts either index-thumb or index-middle pinch', () => {
    const thumb = { x: 0, y: 0 }
    expect(isPinching(thumb, { x: 4, y: 3 }, { x: 40, y: 0 }, 40, false)).toBe(
      true,
    )
    expect(
      isPinching({ x: 80, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 0 }, 40, false),
    ).toBe(true)
  })

  it('uses hysteresis so a held pinch does not flicker at the threshold', () => {
    const thumb = { x: 80, y: 0 }
    const index = { x: 22, y: 0 }
    const middle = { x: 44, y: 0 }
    expect(isPinching(thumb, index, middle, 40, false)).toBe(false)
    expect(isPinching(thumb, index, middle, 40, true)).toBe(true)
  })
})

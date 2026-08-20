import { afterEach, describe, expect, it, vi } from 'vitest'

describe('publicAsset', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it('prefixes BASE_URL and strips leading slashes', async () => {
    vi.stubEnv('BASE_URL', '/')
    const { publicAsset } = await import('./assets')
    expect(publicAsset('masks/a.png')).toBe('/masks/a.png')
    expect(publicAsset('/masks/a.png')).toBe('/masks/a.png')
    expect(publicAsset('///flowers/x.mp4')).toBe('/flowers/x.mp4')
  })

  it('keeps relative base for desktop builds', async () => {
    vi.stubEnv('BASE_URL', './')
    const { publicAsset } = await import('./assets')
    expect(publicAsset('icons/x.svg')).toBe('./icons/x.svg')
  })
})

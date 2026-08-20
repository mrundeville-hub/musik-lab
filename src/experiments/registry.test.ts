import { describe, expect, it } from 'vitest'
import { experiments, getExperiment } from './registry'
import { CARD_LOOK } from './cardLooks'
import type { ExperimentStatus } from '@/shared/types'

const STATUSES = new Set<ExperimentStatus>([
  'new',
  'draft',
  'migrated',
  'polished',
  'archived',
])

describe('experiments registry', () => {
  it('discovers at least one experiment', () => {
    expect(experiments.length).toBeGreaterThan(0)
  })

  it('has unique slugs matching folder contract', () => {
    const slugs = experiments.map((e) => e.metadata.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('validates metadata shape for every entry', () => {
    for (const { metadata: m, Component } of experiments) {
      expect(m.title.trim().length).toBeGreaterThan(0)
      expect(m.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      expect(m.description.trim().length).toBeGreaterThan(0)
      expect(m.year).toBeGreaterThanOrEqual(2020)
      expect(STATUSES.has(m.status)).toBe(true)
      expect(Array.isArray(m.tags)).toBe(true)
      expect(Array.isArray(m.technologies)).toBe(true)
      expect(typeof Component).toBe('object') // LazyExoticComponent
    }
  })

  // cat-gestures once shipped with none of these, so its home card rendered as a
  // grey placeholder among 31 tinted ones. The registry glob can't catch that —
  // CARD_LOOK is a hand-curated map the docs used to not mention.
  it('gives every experiment a home card: emoji, blurb and tint', () => {
    for (const { metadata: m } of experiments) {
      expect(m.emoji, `${m.slug} has no emoji`).toBeTruthy()
      expect(m.blurb?.trim(), `${m.slug} has no blurb`).toBeTruthy()
      expect(CARD_LOOK[m.slug], `${m.slug} is missing from cardLooks.ts`).toBeDefined()
    }
  })

  it('getExperiment finds by slug and misses unknowns', () => {
    const first = experiments[0]!
    expect(getExperiment(first.metadata.slug)?.metadata.slug).toBe(first.metadata.slug)
    expect(getExperiment('no-such-experiment')).toBeUndefined()
  })

  it('sorts by year desc then title asc', () => {
    for (let i = 1; i < experiments.length; i++) {
      const prev = experiments[i - 1]!.metadata
      const curr = experiments[i]!.metadata
      const yearOk = prev.year >= curr.year
      const titleOk =
        prev.year !== curr.year || prev.title.localeCompare(curr.title) <= 0
      expect(yearOk && titleOk).toBe(true)
    }
  })
})

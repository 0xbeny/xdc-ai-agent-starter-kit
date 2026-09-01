import { describe, expect, it } from 'vitest'

import { truncate } from './budgets.ts'

describe('truncate', () => {
  it('returns text unchanged when within budget', () => {
    expect(truncate('abc', 10)).toEqual({ text: 'abc', truncated: false, dropped: 0 })
  })

  it('keeps a head-heavy slice with a marker and never exceeds max', () => {
    const text = 'H'.repeat(700) + 'M'.repeat(300) + 'T'.repeat(200)
    const out = truncate(text, 1000)
    expect(out.truncated).toBe(true)
    expect(out.text.length).toBeLessThanOrEqual(1000)
    expect(out.text.startsWith('H'.repeat(700))).toBe(true)
    expect(out.text.endsWith('T'.repeat(200))).toBe(true)
    expect(out.text).toMatch(/\[\.\.\. \d+ characters truncated \.\.\.\]/)
    expect(out.dropped).toBe(
      text.length -
        (out.text.length - `\n\n[... ${out.dropped} characters truncated ...]\n\n`.length),
    )
  })

  it('hard-slices when max is too small for a marker', () => {
    const out = truncate('x'.repeat(500), 10)
    expect(out.text).toBe('x'.repeat(10))
    expect(out.dropped).toBe(490)
  })

  it('never returns more than max characters', () => {
    for (const max of [0, 1, 30, 45, 46, 100, 999]) {
      expect(truncate('y'.repeat(2000), max).text.length).toBeLessThanOrEqual(max)
    }
  })
})

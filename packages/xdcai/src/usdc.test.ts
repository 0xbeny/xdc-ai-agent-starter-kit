import { describe, expect, it } from 'vitest'

import { formatUsdc, parseUsdc, UsdcError } from './usdc.ts'

describe('parseUsdc', () => {
  it.each([
    ['0.05', 50_000n],
    ['0.0001', 100n],
    ['1', 1_000_000n],
    ['12.345678', 12_345_678n],
    ['0.01 USDC', 10_000n],
    [0.25, 250_000n],
  ])('%s → %s', (input, micro) => {
    expect(parseUsdc(input)).toBe(micro)
  })

  it('is exact where floats are not', () => {
    expect(parseUsdc('0.1') + parseUsdc('0.2')).toBe(parseUsdc('0.3'))
  })

  it.each(['-1', 'abc', '1.2345678', '', '1e3', '0x10'])('rejects %j', (bad) => {
    expect(() => parseUsdc(bad)).toThrow(UsdcError)
  })
})

describe('formatUsdc', () => {
  it.each([
    [50_000n, '0.05'],
    [100n, '0.0001'],
    [1_000_000n, '1'],
    [12_345_678n, '12.345678'],
    [0n, '0'],
  ])('%s → %s', (micro, text) => {
    expect(formatUsdc(micro)).toBe(text)
  })

  it('round-trips', () => {
    for (const s of ['0.000001', '3.5', '100', '0.123456']) expect(formatUsdc(parseUsdc(s))).toBe(s)
  })
})

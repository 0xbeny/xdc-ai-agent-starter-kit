import { describe, expect, it } from 'vitest'

import { isValidSession, passwordMatches, safeEqual, sessionToken } from './session.ts'

describe('session', () => {
  it('is open when no password is configured', async () => {
    expect(await isValidSession(undefined, '')).toBe(true)
  })

  it('accepts only the token derived from the current password', async () => {
    const t = await sessionToken('secret')
    expect(t).toMatch(/^[0-9a-f]{64}$/)
    expect(await isValidSession(t, 'secret')).toBe(true)
    expect(await isValidSession(t, 'rotated')).toBe(false)
    expect(await isValidSession('nope', 'secret')).toBe(false)
    expect(await isValidSession(undefined, 'secret')).toBe(false)
  })

  it('compares in constant time without throwing on length mismatch', () => {
    expect(passwordMatches('secret', 'secret')).toBe(true)
    expect(passwordMatches('secre', 'secret')).toBe(false)
    expect(safeEqual('', '')).toBe(true)
  })
})

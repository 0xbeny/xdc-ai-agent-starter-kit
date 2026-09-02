import { describe, expect, it } from 'vitest'

import { gateDecision, isLoopback } from './gate.ts'

describe('gateDecision (Hermes model: bind decides the auth requirement)', () => {
  it('loopback binds are open without a password', () => {
    for (const h of [undefined, '', '127.0.0.1', 'localhost', '::1'])
      expect(gateDecision(h, '').allow).toBe(true)
  })
  it('non-loopback binds require a password', () => {
    const d = gateDecision('0.0.0.0', '')
    expect(d.allow).toBe(false)
    if (!d.allow) expect(d.reason).toMatch(/DASHBOARD_PASSWORD/)
    expect(gateDecision('0.0.0.0', 'secret').allow).toBe(true)
    expect(gateDecision('192.168.1.20', '').allow).toBe(false)
  })
  it('isLoopback is strict', () => {
    expect(isLoopback('0.0.0.0')).toBe(false)
    expect(isLoopback('bens-mac-mini.local')).toBe(false)
  })
})

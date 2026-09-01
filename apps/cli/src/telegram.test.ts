import { describe, expect, it } from 'vitest'

import { findPairingCode, validateBotToken } from './telegram.ts'

describe('telegram helpers', () => {
  it('finds the latest pairing code in a log', () => {
    expect(
      findPairingCode(
        'x\n[telegram] pairing code: 111111 (send /pair CODE)\n…\n[telegram] pairing code: 222222 (…)',
      ),
    ).toBe('222222')
    expect(findPairingCode('nothing here')).toBeUndefined()
  })

  it('validates tokens against getMe without throwing', async () => {
    const good = await validateBotToken(
      't',
      (async () =>
        new Response(
          JSON.stringify({ ok: true, result: { username: 'kit_bot' } }),
        )) as typeof fetch,
    )
    expect(good).toEqual({ ok: true, username: 'kit_bot' })
    const bad = await validateBotToken(
      't',
      (async () =>
        new Response(JSON.stringify({ ok: false, description: 'Unauthorized' }), {
          status: 401,
        })) as typeof fetch,
    )
    expect(bad).toEqual({ ok: false, error: 'Unauthorized' })
    const down = await validateBotToken('t', (async () => {
      throw new Error('offline')
    }) as typeof fetch)
    expect(down.ok).toBe(false)
  })
})

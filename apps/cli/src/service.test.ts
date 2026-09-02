import { describe, expect, it } from 'vitest'

import { waitForHttp } from './service.ts'

describe('waitForHttp', () => {
  it('gives up immediately when the tick callback returns false', async () => {
    const t0 = Date.now()
    const ok = await waitForHttp('http://127.0.0.1:1/never', 240_000, () => false)
    expect(ok).toBe(false)
    expect(Date.now() - t0).toBeLessThan(15_000) // not the 240s ceiling
  })
})

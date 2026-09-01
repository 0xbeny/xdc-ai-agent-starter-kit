import { afterEach, describe, expect, it } from 'vitest'

import { smokeTest } from './smoke.ts'

describe('smokeTest', () => {
  const before = process.env.XDC_KIT_TEST_KEY
  afterEach(() => {
    if (before === undefined) delete process.env.XDC_KIT_TEST_KEY
    else process.env.XDC_KIT_TEST_KEY = before
  })

  it('applies keys from the provided env to process.env before probing the model', async () => {
    delete process.env.XDC_KIT_TEST_KEY
    // an unreachable custom endpoint fails fast; what we assert is the env propagation
    const result = await smokeTest(
      'custom/probe@http://127.0.0.1:9/v1',
      { XDC_KIT_TEST_KEY: 'from-wizard' },
      3_000,
    )
    expect(process.env.XDC_KIT_TEST_KEY).toBe('from-wizard')
    expect(result.ok).toBe(false)
  }, 20_000)
})

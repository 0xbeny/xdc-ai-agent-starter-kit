import { createTool } from '@mastra/core/tools'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createModelFactory, toBridgeTools } from './model.ts'

describe('toBridgeTools', () => {
  it('keeps executable tools with zod object schemas and drops the rest', async () => {
    const good = createTool({
      id: 'g',
      description: 'good',
      inputSchema: z.object({ a: z.string() }),
      execute: async ({ a }) => `got ${a}`,
    })
    const bridge = toBridgeTools({
      good,
      noExec: { inputSchema: z.object({}) },
      weird: { inputSchema: 'nope', execute: async () => 1 },
    })
    expect(Object.keys(bridge)).toEqual(['good'])
    expect(await bridge.good?.execute?.({ a: 'x' })).toBe('got x')
  })
})

describe('createModelFactory', () => {
  it('returns a stable router id for non-harness providers without touching tools', async () => {
    let asked = 0
    const factory = createModelFactory(
      { provider: 'openai', model: 'gpt-5.6' },
      {},
      async () => (asked++, {}),
    )
    expect(await factory()).toBe('openai/gpt-5.6')
    expect(asked).toBe(0)
  })
})

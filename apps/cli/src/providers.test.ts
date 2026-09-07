import { describe, expect, it } from 'vitest'

import { listModels, envKeyFor, modelSpecString, PROVIDERS, providerById } from './providers.ts'

describe('providers', () => {
  it('lists every provider family the plan promised', () => {
    const ids = PROVIDERS.map((p) => p.id)
    for (const id of [
      'anthropic',
      'openai',
      'xai',
      'moonshot',
      'google',
      'openrouter',
      'ollama',
      'claude-code',
      'codex',
      'custom',
    ]) {
      expect(ids).toContain(id)
    }
  })

  it('builds spec strings with and without a base url', () => {
    expect(modelSpecString('xai', ' grok-4.3 ')).toBe('xai/grok-4.3')
    expect(modelSpecString('custom', 'qwen3-32b', 'http://gpu:8000/v1/')).toBe(
      'custom/qwen3-32b@http://gpu:8000/v1',
    )
  })

  it('knows which providers need a key', () => {
    expect(envKeyFor('moonshot')).toBe('MOONSHOT_API_KEY')
    expect(envKeyFor('claude-code')).toBeNull()
    expect(envKeyFor('ollama')).toBeNull()
    expect(envKeyFor('together')).toBe('TOGETHER_API_KEY')
    expect(providerById('codex')?.cli).toBe('codex')
  })
})

describe('listModels', () => {
  const fake = (body: unknown, ok = true) =>
    (async () => ({ ok, json: async () => body })) as unknown as typeof fetch
  it('parses OpenAI-style lists, filters non-chat models, newest first', async () => {
    const models = await listModels(
      'openai',
      'k',
      undefined,
      fake({
        data: [
          { id: 'gpt-5.5' },
          { id: 'gpt-5.6' },
          { id: 'text-embedding-4' },
          { id: 'whisper-2' },
        ],
      }),
    )
    expect(models).toEqual(['gpt-5.6', 'gpt-5.5'])
  })
  it('parses ollama tags and static claude-code aliases', async () => {
    expect(
      await listModels('ollama', undefined, undefined, fake({ models: [{ name: 'qwen3:8b' }] })),
    ).toEqual(['qwen3:8b'])
    expect(await listModels('claude-code')).toEqual(['sonnet', 'opus', 'haiku'])
  })
  it('returns [] on errors, missing keys and unknown providers', async () => {
    expect(await listModels('anthropic', undefined)).toEqual([])
    expect(await listModels('openai', 'k', undefined, fake({}, false))).toEqual([])
    expect(await listModels('codex')).toEqual([])
    expect(await listModels('nope')).toEqual([])
  })
})

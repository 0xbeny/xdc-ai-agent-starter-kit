import { describe, expect, it } from 'vitest'

import { envKeyFor, modelSpecString, PROVIDERS, providerById } from './providers.ts'

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

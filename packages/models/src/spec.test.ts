import { describe, expect, it } from 'vitest'

import { ModelSpecError, parseModelSpec, providerEnvKey, toMastraModel } from './spec.ts'

describe('parseModelSpec', () => {
  it('parses provider/model', () => {
    expect(parseModelSpec('anthropic/claude-sonnet-4-6')).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
    })
  })

  it('keeps nested gateway model ids intact', () => {
    expect(parseModelSpec('openrouter/deepseek/deepseek-v4')).toEqual({
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4',
    })
  })

  it('parses an explicit OpenAI-compatible base URL', () => {
    expect(parseModelSpec('custom/qwen3-32b@http://gpu-box:8000/v1')).toEqual({
      provider: 'custom',
      model: 'qwen3-32b',
      url: 'http://gpu-box:8000/v1',
    })
  })

  it('keeps model tags containing colons (ollama style)', () => {
    expect(parseModelSpec('ollama/qwen3:8b')).toEqual({ provider: 'ollama', model: 'qwen3:8b' })
  })

  it('trims surrounding whitespace', () => {
    expect(parseModelSpec('  openai/gpt-5.6  ')).toEqual({ provider: 'openai', model: 'gpt-5.6' })
  })

  it.each(['', 'gpt-5.6', 'openai/', '/gpt', 'openai:gpt-5.6', 'custom/x@not-a-url'])(
    'rejects %j',
    (bad) => {
      expect(() => parseModelSpec(bad)).toThrow(ModelSpecError)
    },
  )
})

describe('providerEnvKey', () => {
  it.each([
    ['openai', 'OPENAI_API_KEY'],
    ['anthropic', 'ANTHROPIC_API_KEY'],
    ['xai', 'XAI_API_KEY'],
    ['moonshot', 'MOONSHOT_API_KEY'],
    ['google', 'GOOGLE_GENERATIVE_AI_API_KEY'],
    ['openrouter', 'OPENROUTER_API_KEY'],
    ['groq', 'GROQ_API_KEY'],
    ['deepseek', 'DEEPSEEK_API_KEY'],
    ['mistral', 'MISTRAL_API_KEY'],
  ])('%s → %s', (provider, key) => {
    expect(providerEnvKey(provider)).toBe(key)
  })

  it('returns null for local / keyless providers', () => {
    expect(providerEnvKey('ollama')).toBeNull()
    expect(providerEnvKey('lmstudio')).toBeNull()
    expect(providerEnvKey('custom')).toBeNull()
  })

  it('falls back to <PROVIDER>_API_KEY for unknown providers', () => {
    expect(providerEnvKey('together')).toBe('TOGETHER_API_KEY')
  })
})

describe('toMastraModel', () => {
  it('passes router-native providers through as a string', () => {
    expect(toMastraModel({ provider: 'xai', model: 'grok-4.3' }, {})).toBe('xai/grok-4.3')
  })

  it('maps known OpenAI-compatible providers to their base URL', () => {
    expect(
      toMastraModel({ provider: 'moonshot', model: 'kimi-k2.7' }, { MOONSHOT_API_KEY: 'sk-test' }),
    ).toEqual({ id: 'moonshot/kimi-k2.7', url: 'https://api.moonshot.ai/v1', apiKey: 'sk-test' })
  })

  it('maps ollama to the local server without an api key', () => {
    expect(toMastraModel({ provider: 'ollama', model: 'qwen3:8b' }, {})).toEqual({
      id: 'ollama/qwen3:8b',
      url: 'http://localhost:11434/v1',
    })
  })

  it('honours OLLAMA_BASE_URL when set', () => {
    expect(
      toMastraModel(
        { provider: 'ollama', model: 'qwen3:8b' },
        { OLLAMA_BASE_URL: 'http://gpu:11434' },
      ),
    ).toEqual({ id: 'ollama/qwen3:8b', url: 'http://gpu:11434/v1' })
  })

  it('uses an explicit url from the spec and the matching key if present', () => {
    expect(
      toMastraModel(
        { provider: 'custom', model: 'qwen3-32b', url: 'http://gpu-box:8000/v1' },
        { CUSTOM_API_KEY: 'k' },
      ),
    ).toEqual({ id: 'custom/qwen3-32b', url: 'http://gpu-box:8000/v1', apiKey: 'k' })
  })
})

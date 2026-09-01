import { describe, expect, it } from 'vitest'

import { ModelSpecError } from './spec.ts'
import { missingKeys, resolveModelSlots } from './slots.ts'

describe('resolveModelSlots', () => {
  it('requires MODEL_CHAT', () => {
    expect(() => resolveModelSlots({})).toThrow(ModelSpecError)
  })

  it('defaults fast to chat and leaves embed undefined', () => {
    const slots = resolveModelSlots({ MODEL_CHAT: 'openai/gpt-5.6' })
    expect(slots.chat).toEqual({ provider: 'openai', model: 'gpt-5.6' })
    expect(slots.fast).toEqual(slots.chat)
    expect(slots.embed).toBeUndefined()
  })

  it('treats empty strings as unset', () => {
    const slots = resolveModelSlots({
      MODEL_CHAT: 'openai/gpt-5.6',
      MODEL_FAST: '',
      MODEL_EMBED: '',
    })
    expect(slots.fast).toEqual(slots.chat)
    expect(slots.embed).toBeUndefined()
  })

  it('resolves all three slots independently', () => {
    const slots = resolveModelSlots({
      MODEL_CHAT: 'moonshot/kimi-k2.7',
      MODEL_FAST: 'groq/llama-4-maverick',
      MODEL_EMBED: 'openai/text-embedding-3-small',
    })
    expect(slots.chat.provider).toBe('moonshot')
    expect(slots.fast.provider).toBe('groq')
    expect(slots.embed?.provider).toBe('openai')
  })
})

describe('missingKeys', () => {
  it('lists env keys required by the configured providers that are absent', () => {
    const slots = resolveModelSlots({
      MODEL_CHAT: 'anthropic/claude-sonnet-4-6',
      MODEL_FAST: 'ollama/qwen3:8b',
      MODEL_EMBED: 'openai/text-embedding-3-small',
    })
    expect(missingKeys(slots, { OPENAI_API_KEY: 'x' })).toEqual(['ANTHROPIC_API_KEY'])
  })

  it('deduplicates when slots share a provider', () => {
    const slots = resolveModelSlots({
      MODEL_CHAT: 'openai/gpt-5.6',
      MODEL_FAST: 'openai/gpt-5-mini',
    })
    expect(missingKeys(slots, {})).toEqual(['OPENAI_API_KEY'])
  })
})

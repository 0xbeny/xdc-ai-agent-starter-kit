import { describe, expect, it } from 'vitest'

import {
  HARNESS_PROVIDERS,
  HarnessError,
  isHarnessProvider,
  isLanguageModelLike,
  loadHarnessModel,
} from './harness.ts'
import { providerEnvKey } from './spec.ts'

const fakeModel = (modelId: string) => ({
  specificationVersion: 'v4',
  provider: 'claude-code',
  modelId,
  doGenerate: async () => ({}),
  doStream: async () => ({}),
})

describe('harness providers', () => {
  it('recognises claude-code and codex and treats them as keyless', () => {
    expect(isHarnessProvider('claude-code')).toBe(true)
    expect(isHarnessProvider('codex')).toBe(true)
    expect(isHarnessProvider('openai')).toBe(false)
    expect(providerEnvKey('claude-code')).toBeNull()
    expect(providerEnvKey('codex')).toBeNull()
  })

  it('loads the provider package lazily and builds the model', async () => {
    const calls: unknown[] = []
    const importer = async (pkg: string) => {
      calls.push(pkg)
      return {
        createClaudeCode: (settings: unknown) => (id: string) => (
          calls.push(settings),
          fakeModel(id)
        ),
      }
    }
    const model = await loadHarnessModel(
      { provider: 'claude-code', model: 'opus' },
      { importer, settings: { maxTurns: 1 } },
    )
    expect(model.modelId).toBe('opus')
    expect(calls).toEqual(['ai-sdk-provider-claude-code', { maxTurns: 1 }])
  })

  it('falls back to the default model id when none is given', async () => {
    const importer = async () => ({ createCodexCli: () => (id: string) => fakeModel(id) })
    const model = await loadHarnessModel({ provider: 'codex', model: '' }, { importer })
    expect(model.modelId).toBe(HARNESS_PROVIDERS.codex.defaultModel)
  })

  it('explains what to install when the package is missing', async () => {
    const importer = async () => {
      throw new Error("Cannot find package 'ai-sdk-provider-claude-code'")
    }
    await expect(
      loadHarnessModel({ provider: 'claude-code', model: 'sonnet' }, { importer }),
    ).rejects.toThrow(/pnpm add ai-sdk-provider-claude-code/)
  })

  it('rejects non-harness providers and malformed packages', async () => {
    await expect(loadHarnessModel({ provider: 'openai', model: 'x' })).rejects.toThrow(HarnessError)
    await expect(
      loadHarnessModel({ provider: 'claude-code', model: 'x' }, { importer: async () => ({}) }),
    ).rejects.toThrow(/does not export createClaudeCode/)
    await expect(
      loadHarnessModel(
        { provider: 'claude-code', model: 'x' },
        { importer: async () => ({ createClaudeCode: () => () => ({}) }) },
      ),
    ).rejects.toThrow(/not an AI SDK language model/)
  })

  it('isLanguageModelLike checks the structural essentials', () => {
    expect(isLanguageModelLike(fakeModel('m'))).toBe(true)
    expect(isLanguageModelLike({ specificationVersion: 'v4' })).toBe(false)
    expect(isLanguageModelLike('openai/gpt-5.6')).toBe(false)
  })
})

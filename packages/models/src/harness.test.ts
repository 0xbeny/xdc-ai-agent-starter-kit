import { describe, expect, it } from 'vitest'

import {
  bridgedToolNames,
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
        createClaudeCode: () => (id: string, settings: unknown) => (
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
    expect(calls).toEqual(['ai-sdk-provider-claude-code', { maxTurns: 1, settingSources: [] }])
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

describe('tool bridging', () => {
  it('turns bridgeTools into an in-process MCP server plus allowedTools for Claude Code', async () => {
    const seen: { settings?: Record<string, unknown>; serverArgs?: unknown[] } = {}
    const importer = async () => ({
      createClaudeCode: () => (id: string, settings: Record<string, unknown>) => {
        seen.settings = settings
        return fakeModel(id)
      },
      createAiSdkMcpServer: (...args: unknown[]) => {
        seen.serverArgs = args
        return { type: 'sdk', name: args[0] }
      },
    })
    const tools = {
      memory: { description: 'm', inputSchema: {}, execute: async () => 'ok' },
      xdcai_call: { inputSchema: {} },
    }
    await loadHarnessModel(
      { provider: 'claude-code', model: 'sonnet' },
      { importer, bridgeTools: tools, settings: { allowedTools: ['Read'] } },
    )
    expect(seen.serverArgs?.[0]).toBe('kit')
    expect(Object.keys(seen.serverArgs?.[1] as object)).toEqual(['memory', 'xdcai_call'])
    expect((seen.settings?.mcpServers as Record<string, unknown>).kit).toEqual({
      type: 'sdk',
      name: 'kit',
    })
    expect(seen.settings?.allowedTools).toEqual([
      'Read',
      'mcp__kit__memory',
      'mcp__kit__xdcai_call',
    ])
  })

  it('warns and stays chat-only when the provider cannot bridge', async () => {
    const importer = async () => ({ createCodexCli: () => (id: string) => fakeModel(id) })
    const model = await loadHarnessModel(
      { provider: 'codex', model: 'gpt-5.5' },
      { importer, bridgeTools: { a: { inputSchema: {} } } },
    )
    expect(model.modelId).toBe('gpt-5.5')
  })

  it('names bridged tools the way the CLI sees them', () => {
    expect(bridgedToolNames('kit', { memory: 1, run_command: 1 })).toEqual([
      'mcp__kit__memory',
      'mcp__kit__run_command',
    ])
  })
})

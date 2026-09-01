import { describe, expect, it } from 'vitest'

import { loadConfig } from './config.ts'

describe('loadConfig', () => {
  const base = {
    MODEL_CHAT: 'openai/gpt-5.6',
    AGENT_DATA_DIR: '/tmp/xdc-data',
    AGENT_WORKSPACE: '/tmp/xdc-ws',
  }

  it('derives data paths and default payment policy', () => {
    const c = loadConfig(base)
    expect(c.authFile).toBe('/tmp/xdc-data/xdcai-auth.json')
    expect(c.ledgerFile).toBe('/tmp/xdc-data/ledger.jsonl')
    expect(c.workspaceDir).toBe('/tmp/xdc-ws')
    expect(c.policy.dailyCap).toBe(2_000_000n)
    expect(c.policy.allowedProviders).toBeUndefined()
    expect(c.missingKeys).toEqual(['OPENAI_API_KEY'])
  })

  it('reads payment caps and allowlist from env', () => {
    const c = loadConfig({
      ...base,
      PAY_AUTO_APPROVE_BELOW_USDC: '0.1',
      PAY_PER_CALL_MAX_USDC: '3',
      PAY_DAILY_CAP_USDC: '10',
      PAY_ALLOWED_PROVIDERS: 'TradeFi Network, Gas Tracker',
    })
    expect(c.policy).toEqual({
      autoApproveBelow: 100_000n,
      perCallMax: 3_000_000n,
      dailyCap: 10_000_000n,
      allowedProviders: ['TradeFi Network', 'Gas Tracker'],
    })
  })

  it('treats harness providers as keyless', () => {
    expect(loadConfig({ ...base, MODEL_CHAT: 'claude-code/sonnet' }).missingKeys).toEqual([])
  })
})

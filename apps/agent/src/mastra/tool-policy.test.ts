import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { JsonlApprovalStore } from '@xdc-ai/xdcai'
import { describe, expect, it } from 'vitest'

import { runToolsToggle, ToolPolicyStore } from './tool-policy.ts'

const fresh = () => new ToolPolicyStore(join(mkdtempSync(join(tmpdir(), 'toolpol-')), 'p.json'))

describe('ToolPolicyStore', () => {
  it('defaults on, persists off, filters, and keeps the switchboard reachable', () => {
    const p = fresh()
    expect(p.enabled('fetch_url')).toBe(true)
    p.set('fetch_url', false)
    p.set('wallet_transfer', false)
    expect(p.disabled()).toEqual(['fetch_url', 'wallet_transfer'])
    const filtered = p.filter({ fetch_url: 1, run_command: 2, tools_toggle: 3, memory: 4 })
    expect(Object.keys(filtered).sort()).toEqual(['memory', 'run_command', 'tools_toggle'])
    p.set('fetch_url', true)
    expect(p.disabled()).toEqual(['wallet_transfer'])
  })
})

describe('tools_toggle', () => {
  it('is approval-gated and applies after the human says yes', async () => {
    const deps = {
      policy: fresh(),
      approvals: new JsonlApprovalStore(join(mkdtempSync(join(tmpdir(), 'toolpol-')), 'a.jsonl')),
    }
    const input = { names: ['defi_swap'], action: 'off' as const, reason: 'not using defi' }
    const parked = await runToolsToggle(deps, input)
    expect(parked.ok).toBe(false)
    expect(parked.approvalId).toBeTruthy()
    await deps.approvals.decide(parked.approvalId as string, 'approved')
    const applied = await runToolsToggle(deps, { ...input, approvalId: parked.approvalId })
    expect(applied.ok).toBe(true)
    expect(deps.policy.disabled()).toEqual(['defi_swap'])
  })
})

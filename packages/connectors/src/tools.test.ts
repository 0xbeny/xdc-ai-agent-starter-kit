import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { JsonlApprovalStore } from '@xdc-ai/xdcai'
import { describe, expect, it } from 'vitest'

import { approvalGate } from './tools.ts'

describe('approvalGate', () => {
  it('parks a send, then allows exactly one execution after approval', async () => {
    const approvals = new JsonlApprovalStore(join(mkdtempSync(join(tmpdir(), 'g-')), 'a.jsonl'))
    const input = { channel: '#ops', text: 'deploy done' }
    const first = await approvalGate(approvals, 'slack_send_message', 'send', input, 'Slack')
    expect(first.ok).toBe(false)
    expect(first.error).toMatch(/approval_required/)
    const id = first.approvalId!
    expect((await approvals.get(id))?.preview).toContain('deploy done')
    await approvals.decide(id, 'approved')
    expect(
      (
        await approvalGate(
          approvals,
          'slack_send_message',
          'send',
          { ...input, text: 'changed', approvalId: id },
          'Slack',
        )
      ).error,
    ).toMatch(/different arguments/)
    expect(
      (
        await approvalGate(
          approvals,
          'slack_send_message',
          'send',
          { ...input, approvalId: id },
          'Slack',
        )
      ).ok,
    ).toBe(true)
    expect(
      (
        await approvalGate(
          approvals,
          'slack_send_message',
          'send',
          { ...input, approvalId: id },
          'Slack',
        )
      ).error,
    ).toMatch(/consumed/)
  })
})

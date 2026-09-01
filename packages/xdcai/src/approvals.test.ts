import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { APPROVAL_TTL_MS, ApprovalError, JsonlApprovalStore, sameInput } from './approvals.ts'

const mk = (clock?: () => Date) =>
  new JsonlApprovalStore(join(mkdtempSync(join(tmpdir(), 'appr-')), 'approvals.jsonl'), clock)

describe('JsonlApprovalStore', () => {
  it('creates pending approvals and lists newest first', async () => {
    let t = 0
    const s = mk(() => new Date(1_700_000_000_000 + t++ * 1000))
    const a = await s.create({
      tool: 'xdcai_call',
      kind: 'call',
      amount: 250_000n,
      reason: 'above threshold',
      input: { url: 'u' },
    })
    const b = await s.create({
      tool: 'xdcai_wallet_transfer',
      kind: 'transfer',
      reason: 'transfer',
      input: { to: 'x' },
    })
    expect(a.status).toBe('pending')
    expect((await s.list('pending')).map((x) => x.id)).toEqual([b.id, a.id])
    expect((await s.get(a.id))?.amount).toBe(250_000n)
  })

  it('decides once, then consumes once', async () => {
    const s = mk()
    const a = await s.create({ tool: 't', kind: 'call', reason: 'r', input: {} })
    await s.decide(a.id, 'approved', 'ok by beny')
    expect((await s.get(a.id))?.status).toBe('approved')
    await expect(s.decide(a.id, 'denied')).rejects.toThrow(ApprovalError)
    await s.consume(a.id)
    expect((await s.get(a.id))?.status).toBe('consumed')
    await expect(s.consume(a.id)).rejects.toThrow(/consumed/)
  })

  it('refuses to consume a denied approval', async () => {
    const s = mk()
    const a = await s.create({ tool: 't', kind: 'call', reason: 'r', input: {} })
    await s.decide(a.id, 'denied')
    await expect(s.consume(a.id)).rejects.toThrow(/denied/)
  })

  it('expires pending approvals after the TTL', async () => {
    let now = 1_700_000_000_000
    const s = mk(() => new Date(now))
    const a = await s.create({ tool: 't', kind: 'call', reason: 'r', input: {} })
    now += APPROVAL_TTL_MS + 1
    expect((await s.get(a.id))?.status).toBe('expired')
    expect(await s.list('pending')).toEqual([])
    await expect(s.decide(a.id, 'approved')).rejects.toThrow(/expired/)
  })

  it('survives reopening the file', async () => {
    const s = mk()
    const a = await s.create({ tool: 't', kind: 'defi', amount: 5n, reason: 'r', input: { x: 1 } })
    const again = new JsonlApprovalStore(s.path)
    expect((await again.get(a.id))?.amount).toBe(5n)
  })
})

describe('sameInput', () => {
  it('ignores approvalId and key order', () => {
    expect(sameInput({ b: 1, a: 'x' }, { a: 'x', b: 1, approvalId: 'z' })).toBe(true)
    expect(sameInput({ a: 'x' }, { a: 'y' })).toBe(false)
  })
})

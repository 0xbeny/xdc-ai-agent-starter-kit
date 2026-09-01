import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { Catalog } from './catalog.ts'
import { extractPaymentFacts, guard, MONEY_TOOLS } from './guard.ts'
import { JsonlApprovalStore } from './approvals.ts'
import { MemoryLedger } from './ledger.ts'
import { DEFAULT_POLICY, PaymentPolicy } from './policy.ts'
import { parseUsdc } from './usdc.ts'

const GAS = 'https://api.xdcai.tech/x402/connect/gw_ee72d07583c70aa0a6/gas'
const QUIZ = 'https://api.xdcai.tech/x402/connect/gw_b9e57cfbf06bc85f32/api/quiz/:id'
const BATCH = 'https://api.xdcai.tech/x402/connect/gw_f27bfcecf4eafd6e27/v1/node/batch-status'
const catalog = Catalog.from([
  {
    id: 'gas',
    provider: 'Gas Tracker',
    capability: 'gas',
    price: '0.0002 USDC',
    method: 'GET',
    url: GAS,
  },
  {
    id: 'quiz',
    provider: 'Learn402 Solidity',
    capability: 'quiz',
    price: '0.01 USDC',
    method: 'GET',
    url: QUIZ,
  },
  {
    id: 'batch',
    provider: 'NodeLens',
    capability: 'batch',
    price: '0.25 USDC',
    method: 'GET',
    url: BATCH,
  },
])

function setup() {
  const ledger = new MemoryLedger()
  const policy = new PaymentPolicy(DEFAULT_POLICY, ledger, () => new Date('2026-09-01T10:00:00Z'))
  const approvals = new JsonlApprovalStore(join(mkdtempSync(join(tmpdir(), 'appr-')), 'a.jsonl'))
  return {
    ledger,
    policy,
    approvals,
    deps: {
      policy,
      approvals,
      catalog: () => catalog,
      runId: () => 'run-1',
      threadId: () => 'thread-9',
    },
  }
}

describe('extractPaymentFacts', () => {
  it('reads paid/txHash from objects and from JSON text in MCP content', () => {
    expect(extractPaymentFacts({ ok: true, status: 200, paid: '0.01', txHash: '0xabc' })).toEqual({
      ok: true,
      status: 200,
      paid: parseUsdc('0.01'),
      txHash: '0xabc',
    })
    const mcp = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ ok: false, status: 502, paid: '0.01', txHash: '0xdead' }),
        },
      ],
    }
    expect(extractPaymentFacts(mcp)).toMatchObject({ ok: false, status: 502, txHash: '0xdead' })
    expect(extractPaymentFacts('plain text')).toEqual({})
  })
})

describe('guard(call)', () => {
  it('lets a cheap catalog call through without approval and records it as settled', async () => {
    const { deps, ledger } = setup()
    const g = guard('call', deps)
    expect(await g.needsApproval({ url: GAS })).toBe(false)
    const out = await g.execute({ url: GAS }, async () => ({
      ok: true,
      status: 200,
      paid: '0.0002',
      txHash: '0x1',
    }))
    expect(out.ok).toBe(true)
    expect(out.entry).toMatchObject({
      status: 'settled',
      amount: parseUsdc('0.0002'),
      txHash: '0x1',
      provider: 'Gas Tracker',
      runId: 'run-1',
    })
    const rows = await ledger.since(new Date(0))
    expect(rows.map((r) => r.status)).toEqual(['pending', 'settled'])
    expect(rows[0]?.id).toBe(rows[1]?.id)
  })

  it('requires approval for calls at or above the threshold and for unknown URLs', async () => {
    const { deps } = setup()
    const g = guard('call', deps)
    expect(await g.needsApproval({ url: BATCH })).toBe(true)
    expect(await g.needsApproval({ url: 'https://elsewhere.example/paid' })).toBe(true)
    expect(await g.needsApproval({ url: QUIZ.replace(':id', '7') })).toBe(false)
  })

  it('blocks a duplicate of an already-paid request', async () => {
    const { deps } = setup()
    const g = guard('call', deps)
    await g.execute({ url: GAS }, async () => ({ ok: true, paid: '0.0002', txHash: '0xfirst' }))
    let ran = false
    const dup = await g.execute({ url: GAS }, async () => {
      ran = true
      return {}
    })
    expect(ran).toBe(false)
    expect(dup.ok).toBe(false)
    expect(dup.error).toMatch(/already paid.*0xfirst/)
    const other = await g.execute({ url: `${GAS}?block=latest` }, async () => ({
      ok: true,
      paid: '0.0002',
    }))
    expect(other.ok).toBe(true)
  })

  it('records provider failures as failed so a retry is allowed after verification', async () => {
    const { deps, policy } = setup()
    const g = guard('call', deps)
    const out = await g.execute({ url: GAS }, async () => ({
      content: [{ type: 'text', text: '{"ok":false,"status":502}' }],
    }))
    expect(out.ok).toBe(false)
    expect(out.entry?.status).toBe('failed')
    expect(await policy.spentToday()).toBe(0n)
    const again = await g.execute({ url: GAS }, async () => ({ ok: true, paid: '0.0002' }))
    expect(again.ok).toBe(true)
  })

  it('denies over-cap calls before touching the tool', async () => {
    const { deps, policy } = setup()
    await policy.record({ kind: 'call', amount: parseUsdc('1.9'), status: 'settled' })
    const g = guard('call', deps)
    let ran = false
    const out = await g.execute({ url: BATCH }, async () => {
      ran = true
      return {}
    })
    expect(ran).toBe(false)
    expect(out.ok).toBe(false)
    expect(out.error).toMatch(/daily cap/)
  })

  it('marks thrown errors as failed', async () => {
    const { deps } = setup()
    const out = await guard('call', deps).execute({ url: GAS }, async () => {
      throw new Error('network down')
    })
    expect(out.ok).toBe(false)
    expect(out.entry?.status).toBe('failed')
    expect(out.error).toBe('network down')
  })
})

describe('approval protocol', () => {
  it('parks an above-threshold call, then runs it once approved with the same arguments', async () => {
    const { deps, approvals } = setup()
    const g = guard('call', deps)
    let ran = 0
    const first = await g.execute(
      { url: BATCH },
      async () => (ran++, { ok: true, paid: '0.25', txHash: '0xb' }),
    )
    expect(ran).toBe(0)
    expect(first.ok).toBe(false)
    expect(first.error).toMatch(/approval_required/)
    const id = first.approval?.id as string
    expect(await approvals.get(id)).toMatchObject({
      status: 'pending',
      tool: 'call',
      amount: parseUsdc('0.25'),
      threadId: 'thread-9',
    })

    const stillPending = await g.execute({ url: BATCH, approvalId: id }, async () => (ran++, {}))
    expect(ran).toBe(0)
    expect(stillPending.error).toMatch(/still pending/)

    await approvals.decide(id, 'approved')
    const wrongArgs = await g.execute(
      { url: `${BATCH}?x=1`, approvalId: id },
      async () => (ran++, {}),
    )
    expect(ran).toBe(0)
    expect(wrongArgs.error).toMatch(/different arguments/)

    const done = await g.execute(
      { url: BATCH, approvalId: id },
      async () => (ran++, { ok: true, paid: '0.25', txHash: '0xb' }),
    )
    expect(ran).toBe(1)
    expect(done.ok).toBe(true)
    expect(done.entry?.status).toBe('settled')
    expect((await approvals.get(id))?.status).toBe('consumed')

    const replay = await g.execute({ url: BATCH, approvalId: id }, async () => (ran++, {}))
    expect(ran).toBe(1)
    expect(replay.error).toMatch(/consumed/)
  })

  it('reports a denial back to the agent', async () => {
    const { deps, approvals } = setup()
    const g = guard('wallet_transfer', deps)
    const first = await g.execute({ to: '0xabc', amount: '0.5' }, async () => ({}))
    const id = first.approval?.id as string
    await approvals.decide(id, 'denied', 'not today')
    const after = await g.execute({ to: '0xabc', amount: '0.5', approvalId: id }, async () => ({}))
    expect(after.ok).toBe(false)
    expect(after.error).toMatch(/denied/)
  })

  it('refuses outright when no approval store is configured', async () => {
    const { policy } = setup()
    const g = guard('call', { policy, catalog: () => catalog })
    const out = await g.execute({ url: BATCH }, async () => ({}))
    expect(out.ok).toBe(false)
    expect(out.error).toMatch(/no approval channel/)
  })
})

describe('guard(transfers and defi)', () => {
  it('always needs approval and enforces caps on the amount', async () => {
    const { deps } = setup()
    const t = guard('wallet_transfer', deps)
    expect(t.kind).toBe('transfer')
    expect(await t.needsApproval({ to: '0xabc', amount: '0.01' })).toBe(true)
    const tooBig = await t.execute({ to: '0xabc', amount: '5' }, async () => ({}))
    expect(tooBig.ok).toBe(false)
    expect(tooBig.error).toMatch(/per-call maximum/)
    const parked = await t.execute({ to: '0xabc', amount: '0.5' }, async () => ({
      ok: true,
      txHash: '0xt',
    }))
    expect(parked.error).toMatch(/approval_required/)
    await deps.approvals.decide(parked.approval?.id as string, 'approved')
    const okTransfer = await t.execute(
      { to: '0xabc', amount: '0.5', approvalId: parked.approval?.id },
      async () => ({ ok: true, txHash: '0xt' }),
    )
    expect(okTransfer.entry).toMatchObject({
      kind: 'transfer',
      amount: parseUsdc('0.5'),
      status: 'settled',
      txHash: '0xt',
    })
  })

  it('knows which tools move money', () => {
    expect(Object.keys(MONEY_TOOLS)).toEqual(
      expect.arrayContaining(['call', 'wallet_transfer', 'defi_swap', 'defi_lend', 'defi_supply']),
    )
    expect(() => guard('wallet_balance', setup().deps)).toThrow(/not a money tool/)
  })
})

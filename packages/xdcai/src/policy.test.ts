import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { JsonlLedger, MemoryLedger } from './ledger.ts'
import { DEFAULT_POLICY, idempotencyKey, PaymentPolicy, startOfUtcDay } from './policy.ts'
import { parseUsdc } from './usdc.ts'

const NOW = new Date('2026-09-01T10:00:00Z')
const make = (ledger = new MemoryLedger()) => new PaymentPolicy(DEFAULT_POLICY, ledger, () => NOW)

describe('PaymentPolicy.evaluate', () => {
  it('allows cheap marketplace calls without a human', async () => {
    const d = await make().evaluate({
      kind: 'call',
      amount: parseUsdc('0.01'),
      provider: 'Gas Tracker',
    })
    expect(d.outcome).toBe('allow')
  })

  it('requires approval at or above the auto-approve threshold', async () => {
    expect((await make().evaluate({ kind: 'call', amount: parseUsdc('0.05') })).outcome).toBe(
      'approve',
    )
    expect((await make().evaluate({ kind: 'call', amount: parseUsdc('0.25') })).outcome).toBe(
      'approve',
    )
  })

  it('denies anything above the per-call maximum, approval or not', async () => {
    const d = await make().evaluate({ kind: 'call', amount: parseUsdc('1.000001') })
    expect(d.outcome).toBe('deny')
    expect(d.reason).toMatch(/per-call maximum/)
  })

  it('always routes transfers and DeFi actions to a human', async () => {
    expect(
      (await make().evaluate({ kind: 'transfer', amount: parseUsdc('0.000001') })).outcome,
    ).toBe('approve')
    expect((await make().evaluate({ kind: 'defi', amount: 0n })).outcome).toBe('approve')
  })

  it('enforces the daily cap using settled and pending spend since UTC midnight', async () => {
    const ledger = new MemoryLedger()
    const p = make(ledger)
    await p.record({ kind: 'call', amount: parseUsdc('1.5'), status: 'settled' })
    await p.record({ kind: 'call', amount: parseUsdc('0.4'), status: 'pending' })
    await p.record({ kind: 'call', amount: parseUsdc('9'), status: 'failed' })
    expect(await p.spentToday()).toBe(parseUsdc('1.9'))
    const d = await p.evaluate({ kind: 'call', amount: parseUsdc('0.2') })
    expect(d.outcome).toBe('deny')
    expect(d.reason).toMatch(/daily cap/)
    expect((await p.evaluate({ kind: 'call', amount: parseUsdc('0.15') })).outcome).toBe('deny')
    // exactly reaching the cap is allowed; a human still approves because 0.1 ≥ auto-approve threshold
    expect((await p.evaluate({ kind: 'call', amount: parseUsdc('0.1') })).outcome).toBe('approve')
    expect((await p.evaluate({ kind: 'call', amount: parseUsdc('0.01') })).outcome).toBe('allow')
  })

  it("ignores yesterday's spend", async () => {
    const ledger = new MemoryLedger()
    await ledger.append({
      id: 'y',
      at: '2026-08-31T23:59:59Z',
      kind: 'call',
      amount: parseUsdc('2'),
      status: 'settled',
    })
    expect(await make(ledger).spentToday()).toBe(0n)
  })

  it('denies providers outside the allowlist', async () => {
    const p = new PaymentPolicy(
      { ...DEFAULT_POLICY, allowedProviders: ['TradeFi Network'] },
      new MemoryLedger(),
      () => NOW,
    )
    expect((await p.evaluate({ kind: 'call', amount: 100n, provider: 'Apify' })).outcome).toBe(
      'deny',
    )
    expect(
      (await p.evaluate({ kind: 'call', amount: 100n, provider: 'TradeFi Network' })).outcome,
    ).toBe('allow')
  })
})

describe('append-only status transitions', () => {
  it('counts only the latest row per entry id', async () => {
    const p = make()
    const pending = await p.record({
      kind: 'call',
      amount: parseUsdc('0.5'),
      status: 'pending',
      idempotencyKey: 'k1',
    })
    expect(await p.spentToday()).toBe(parseUsdc('0.5'))
    await p.record({ ...pending, status: 'failed' })
    expect(await p.spentToday()).toBe(0n)
    expect(await p.priorPayment('k1')).toBeUndefined()
    const second = await p.record({
      kind: 'call',
      amount: parseUsdc('0.3'),
      status: 'pending',
      idempotencyKey: 'k1',
    })
    await p.record({ ...second, status: 'settled', txHash: '0x2' })
    expect(await p.spentToday()).toBe(parseUsdc('0.3'))
    expect((await p.priorPayment('k1'))?.txHash).toBe('0x2')
  })
})

describe('idempotency', () => {
  it('derives the same key for the same logical request and different keys otherwise', () => {
    const a = idempotencyKey({ method: 'get', url: 'https://x/y?q=1' })
    expect(a).toBe(idempotencyKey({ method: 'GET', url: 'https://x/y?q=1' }))
    expect(a).not.toBe(idempotencyKey({ method: 'GET', url: 'https://x/y?q=2' }))
    expect(a).not.toBe(idempotencyKey({ method: 'GET', url: 'https://x/y?q=1', body: { a: 1 } }))
  })

  it('finds a prior non-failed payment by key', async () => {
    const p = make()
    const key = idempotencyKey({ method: 'GET', url: 'https://api/x' })
    expect(await p.priorPayment(key)).toBeUndefined()
    await p.record({ kind: 'call', amount: 100n, status: 'failed', idempotencyKey: key })
    expect(await p.priorPayment(key)).toBeUndefined()
    await p.record({
      kind: 'call',
      amount: 100n,
      status: 'settled',
      idempotencyKey: key,
      txHash: '0xabc',
    })
    expect((await p.priorPayment(key))?.txHash).toBe('0xabc')
  })
})

describe('JsonlLedger', () => {
  it('persists bigint amounts and filters by time', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'ledger-')), 'ledger.jsonl')
    const ledger = new JsonlLedger(file)
    await ledger.append({
      id: '1',
      at: '2026-09-01T09:00:00Z',
      kind: 'call',
      amount: 123n,
      status: 'settled',
      idempotencyKey: 'k',
    })
    await ledger.append({
      id: '2',
      at: '2026-08-30T09:00:00Z',
      kind: 'call',
      amount: 5n,
      status: 'settled',
    })
    const today = await new JsonlLedger(file).since(startOfUtcDay(NOW))
    expect(today).toHaveLength(1)
    expect(today[0]?.amount).toBe(123n)
    expect((await ledger.byIdempotencyKey('k')).map((e) => e.id)).toEqual(['1'])
  })
})

describe('startOfUtcDay', () => {
  it('truncates to UTC midnight', () => {
    expect(startOfUtcDay(new Date('2026-09-01T23:59:59Z')).toISOString()).toBe(
      '2026-09-01T00:00:00.000Z',
    )
  })
})

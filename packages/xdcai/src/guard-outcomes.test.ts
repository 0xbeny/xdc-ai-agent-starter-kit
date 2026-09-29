import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { Catalog } from './catalog.ts'
import { guard } from './guard.ts'
import { JsonlLedger, MemoryLedger } from './ledger.ts'
import { DEFAULT_POLICY, idempotencyKey, PaymentPolicy } from './policy.ts'

const URL = 'https://provider.example/test'
const AMOUNT = 10_000n
const NOW = () => new Date('2026-09-29T10:00:00Z')
const catalog = Catalog.from([{ url: URL, price: '0.01', method: 'GET' }])
const key = idempotencyKey({ method: 'GET', url: URL })
const directories: string[] = []

afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function setup() {
  const policy = new PaymentPolicy(DEFAULT_POLICY, new MemoryLedger(), NOW)
  return { policy, guarded: guard('call', { policy, catalog: () => catalog }) }
}

describe('payment outcome is independent of delivery outcome', () => {
  it.each([
    { ok: false, status: 502, paid: '0.01', txHash: '0xreported' },
    {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ ok: false, status: 502, paid: '0.01', txHash: '0xreported' }),
        },
      ],
    },
  ])('retains reported spend when delivery fails: %j', async (result) => {
    const { policy, guarded } = setup()
    const run = vi.fn(async () => result)
    const out = await guarded.execute({ url: URL }, run)
    expect(out.ok).toBe(false)
    expect(out.result).toEqual(result)
    expect(out.entry).toMatchObject({ status: 'settled', amount: AMOUNT, txHash: '0xreported' })
    expect(await policy.spentToday()).toBe(AMOUNT)
    expect((await guarded.execute({ url: URL }, run)).ok).toBe(false)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it.each([
    { ok: false, status: 502 },
    { status: 503 },
    { ok: false, txHash: '0xunresolved' },
    { ok: false, paid: '0', txHash: '0xunresolved' },
    { ok: false, paid: 'invalid' },
  ])('reserves the quoted amount when payment is unresolved: %j', async (result) => {
    const { policy, guarded } = setup()
    const run = vi.fn(async () => result)
    const out = await guarded.execute({ url: URL }, run)
    expect(out.ok).toBe(false)
    expect(out.entry).toMatchObject({ status: 'pending', amount: AMOUNT })
    expect(await policy.spentToday()).toBe(AMOUNT)
    const again = await guarded.execute({ url: URL }, run)
    expect(again.ok).toBe(false)
    expect(again.error).toMatch(/unresolved/i)
    expect(again.error).not.toMatch(/already paid/i)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('allows a retry when the provider explicitly reports no payment and no transaction', async () => {
    const { policy, guarded } = setup()
    const run = vi.fn(async () => ({ ok: false, status: 502, paid: '0' }))
    const out = await guarded.execute({ url: URL }, run)
    expect(out.entry).toMatchObject({ status: 'failed', amount: 0n })
    expect(await policy.spentToday()).toBe(0n)
    expect(await policy.priorPayment(key)).toBeUndefined()
    await guarded.execute({ url: URL }, run)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('blocks an identical retry after an exception even while budget remains', async () => {
    const { policy, guarded } = setup()
    const run = vi.fn(async () => {
      throw new Error('confirmation unavailable')
    })
    await guarded.execute({ url: URL }, run)
    const again = await guarded.execute({ url: URL }, run)
    expect(again.error).toMatch(/unresolved/i)
    expect(run).toHaveBeenCalledTimes(1)
    expect(await policy.spentToday()).toBe(AMOUNT)
  })

  it('keeps an interrupted execution reserved across a restart until explicitly reconciled', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'guard-outcome-'))
    directories.push(dir)
    const path = join(dir, 'ledger.jsonl')
    const config = { ...DEFAULT_POLICY, dailyCap: AMOUNT }
    const policy = new PaymentPolicy(config, new JsonlLedger(path), NOW)
    let executions = 0
    const run = vi.fn(async () => {
      executions++
      throw new Error('confirmation unavailable')
    })
    const out = await guard('call', { policy, catalog: () => catalog }).execute({ url: URL }, run)
    expect(out.ok).toBe(false)
    expect(out.error).toBe('confirmation unavailable')
    expect(out.entry?.status).toBe('pending')

    const reopened = new PaymentPolicy(config, new JsonlLedger(path), NOW)
    expect(await reopened.spentToday()).toBe(AMOUNT)
    expect((await reopened.evaluate({ kind: 'call', amount: 1n })).outcome).toBe('deny')
    const again = await guard('call', { policy: reopened, catalog: () => catalog }).execute(
      { url: URL },
      run,
    )
    expect(again.ok).toBe(false)
    expect(executions).toBe(1)

    const pending = await reopened.priorPayment(key)
    expect(pending).toBeDefined()
    if (!pending) throw new Error('missing pending entry')
    // Only an explicit reconciliation to no payment releases the reservation.
    await reopened.record({ ...pending, status: 'failed', note: 'confirmed unpaid by operator' })
    expect(await reopened.spentToday()).toBe(0n)
    expect(await reopened.priorPayment(key)).toBeUndefined()
    const reconciled = await guard('call', { policy: reopened, catalog: () => catalog }).execute(
      { url: URL },
      async () => ({ ok: true, paid: '0.01' }),
    )
    expect(reconciled.ok).toBe(true)
    expect(await reopened.spentToday()).toBe(AMOUNT)
  })
})

import { createHash, randomUUID } from 'node:crypto'

import type { Ledger, LedgerEntry, SpendKind } from './ledger.ts'
import { formatUsdc } from './usdc.ts'

export interface PolicyConfig {
  /** Calls priced strictly below this run without a human (micro-USDC). */
  autoApproveBelow: bigint
  /** Hard ceiling per call; above this is denied even with approval (micro-USDC). */
  perCallMax: bigint
  /** Rolling UTC-day cap across all spend (micro-USDC). */
  dailyCap: bigint
  /** When set, only these providers may be paid. */
  allowedProviders?: readonly string[]
}

export interface SpendIntent {
  kind: SpendKind
  amount: bigint
  provider?: string
  capability?: string
  url?: string
}

export type Decision =
  | { outcome: 'allow'; reason: string }
  | { outcome: 'approve'; reason: string }
  | { outcome: 'deny'; reason: string }

export const DEFAULT_POLICY: PolicyConfig = {
  autoApproveBelow: 50_000n, // 0.05 USDC
  perCallMax: 1_000_000n, // 1 USDC
  dailyCap: 2_000_000n, // 2 USDC
}

export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/** Deterministic key for "the same logical request", so a retry can be recognised before it pays twice. */
export function idempotencyKey(input: { method: string; url: string; body?: unknown }): string {
  const body = input.body === undefined ? '' : JSON.stringify(input.body)
  return createHash('sha256')
    .update(`${input.method.toUpperCase()}\n${input.url}\n${body}`)
    .digest('hex')
}

/** The ledger is append-only: a row per status change, sharing the entry id. Keep only each id's latest row. */
export function latestById(rows: readonly LedgerEntry[]): LedgerEntry[] {
  const byId = new Map<string, LedgerEntry>()
  for (const row of rows) byId.set(row.id, row)
  return [...byId.values()]
}

export class PaymentPolicy {
  readonly config: PolicyConfig
  readonly ledger: Ledger
  private readonly clock: () => Date

  constructor(config: PolicyConfig, ledger: Ledger, clock: () => Date = () => new Date()) {
    this.config = config
    this.ledger = ledger
    this.clock = clock
  }

  async spentToday(): Promise<bigint> {
    const rows = latestById(await this.ledger.since(startOfUtcDay(this.clock())))
    return rows.filter((r) => r.status !== 'failed').reduce((sum, r) => sum + r.amount, 0n)
  }

  async evaluate(intent: SpendIntent): Promise<Decision> {
    const { amount } = intent
    if (amount < 0n) return { outcome: 'deny', reason: 'negative amount' }

    if (
      intent.provider &&
      this.config.allowedProviders &&
      !this.config.allowedProviders.includes(intent.provider)
    ) {
      return { outcome: 'deny', reason: `provider "${intent.provider}" is not on the allowlist` }
    }
    if (amount > this.config.perCallMax) {
      return {
        outcome: 'deny',
        reason: `${formatUsdc(amount)} USDC exceeds the per-call maximum of ${formatUsdc(this.config.perCallMax)} USDC`,
      }
    }
    const spent = await this.spentToday()
    if (spent + amount > this.config.dailyCap) {
      return {
        outcome: 'deny',
        reason: `daily cap ${formatUsdc(this.config.dailyCap)} USDC would be exceeded (spent ${formatUsdc(spent)}, requested ${formatUsdc(amount)})`,
      }
    }
    if (intent.kind !== 'call') {
      return { outcome: 'approve', reason: `${intent.kind} actions always need a human` }
    }
    if (amount >= this.config.autoApproveBelow) {
      return {
        outcome: 'approve',
        reason: `${formatUsdc(amount)} USDC is at or above the auto-approve threshold of ${formatUsdc(this.config.autoApproveBelow)} USDC`,
      }
    }
    return {
      outcome: 'allow',
      reason: `${formatUsdc(amount)} USDC is below the auto-approve threshold`,
    }
  }

  /** Returns the earlier settled/pending entry for this key, if the same logical request already paid. */
  async priorPayment(key: string): Promise<LedgerEntry | undefined> {
    const rows = latestById(await this.ledger.byIdempotencyKey(key))
    return rows.filter((r) => r.status !== 'failed').at(-1)
  }

  async record(entry: Omit<LedgerEntry, 'id' | 'at'>): Promise<LedgerEntry> {
    const full: LedgerEntry = { id: randomUUID(), at: this.clock().toISOString(), ...entry }
    await this.ledger.append(full)
    return full
  }
}

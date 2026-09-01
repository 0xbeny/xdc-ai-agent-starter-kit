import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'

export type SpendKind = 'call' | 'transfer' | 'defi'
export type LedgerStatus = 'pending' | 'settled' | 'failed'

export interface LedgerEntry {
  id: string
  at: string
  kind: SpendKind
  /** micro-USDC */
  amount: bigint
  status: LedgerStatus
  provider?: string
  capability?: string
  url?: string
  txHash?: string
  idempotencyKey?: string
  runId?: string
  note?: string
}

export interface Ledger {
  append(entry: LedgerEntry): Promise<void>
  /** Entries with `at >= since`, oldest first. */
  since(since: Date): Promise<LedgerEntry[]>
  /** Every entry recorded under this idempotency key, oldest first. */
  byIdempotencyKey(key: string): Promise<LedgerEntry[]>
}

export class MemoryLedger implements Ledger {
  private readonly rows: LedgerEntry[] = []
  async append(entry: LedgerEntry): Promise<void> {
    this.rows.push({ ...entry })
  }
  async since(since: Date): Promise<LedgerEntry[]> {
    const t = since.getTime()
    return this.rows.filter((r) => Date.parse(r.at) >= t)
  }
  async byIdempotencyKey(key: string): Promise<LedgerEntry[]> {
    return this.rows.filter((r) => r.idempotencyKey === key)
  }
}

type Serialized = Omit<LedgerEntry, 'amount'> & { amount: string }

/** Append-only JSON Lines file. Good enough for a single node; the Postgres ledger lands with the dashboard. */
export class JsonlLedger implements Ledger {
  constructor(readonly path: string) {}

  async append(entry: LedgerEntry): Promise<void> {
    mkdirSync(dirname(this.path), { recursive: true })
    const row: Serialized = { ...entry, amount: entry.amount.toString() }
    appendFileSync(this.path, `${JSON.stringify(row)}\n`)
  }

  async since(since: Date): Promise<LedgerEntry[]> {
    const t = since.getTime()
    return this.readAll().filter((r) => Date.parse(r.at) >= t)
  }

  async byIdempotencyKey(key: string): Promise<LedgerEntry[]> {
    return this.readAll().filter((r) => r.idempotencyKey === key)
  }

  private readAll(): LedgerEntry[] {
    if (!existsSync(this.path)) return []
    return readFileSync(this.path, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => {
        const row = JSON.parse(line) as Serialized
        return { ...row, amount: BigInt(row.amount) }
      })
  }
}

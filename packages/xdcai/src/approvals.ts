import { randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'consumed' | 'expired'
export type ApprovalKind = 'call' | 'transfer' | 'defi' | 'connector' | 'improve' | 'grant'

export interface Approval {
  id: string
  createdAt: string
  status: ApprovalStatus
  tool: string
  kind: ApprovalKind
  /** micro-USDC, when money is involved */
  amount?: bigint
  reason: string
  input: Record<string, unknown>
  /** Human-readable rendering of what will happen (e.g. the email that would be sent). */
  preview?: string
  threadId?: string
  decidedAt?: string
  note?: string
}

export interface ApprovalStore {
  create(a: Omit<Approval, 'id' | 'createdAt' | 'status'>): Promise<Approval>
  get(id: string): Promise<Approval | undefined>
  list(status?: ApprovalStatus): Promise<Approval[]>
  decide(id: string, decision: 'approved' | 'denied', note?: string): Promise<Approval>
  /** Marks an approved approval as used so it cannot authorise a second execution. */
  consume(id: string): Promise<Approval>
}

export class ApprovalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ApprovalError'
  }
}

export const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000

function withExpiry(a: Approval, now: number): Approval {
  if (a.status === 'pending' && Date.parse(a.createdAt) + APPROVAL_TTL_MS < now)
    return { ...a, status: 'expired' }
  return a
}

/** Append-only JSONL; the latest row per id wins. */
export class JsonlApprovalStore implements ApprovalStore {
  readonly path: string
  private readonly clock: () => Date

  constructor(path: string, clock: () => Date = () => new Date()) {
    this.path = path
    this.clock = clock
  }

  private readAll(): Map<string, Approval> {
    const byId = new Map<string, Approval>()
    if (!existsSync(this.path)) return byId
    for (const line of readFileSync(this.path, 'utf8').split('\n')) {
      if (!line.trim()) continue
      const { amount, ...rest } = JSON.parse(line) as Omit<Approval, 'amount'> & { amount?: string }
      byId.set(rest.id, amount !== undefined ? { ...rest, amount: BigInt(amount) } : rest)
    }
    return byId
  }

  private write(a: Approval): void {
    mkdirSync(dirname(this.path), { recursive: true })
    appendFileSync(
      this.path,
      `${JSON.stringify({ ...a, ...(a.amount !== undefined ? { amount: a.amount.toString() } : {}) })}\n`,
    )
  }

  async create(a: Omit<Approval, 'id' | 'createdAt' | 'status'>): Promise<Approval> {
    const full: Approval = {
      ...a,
      id: randomUUID(),
      createdAt: this.clock().toISOString(),
      status: 'pending',
    }
    this.write(full)
    return full
  }

  async get(id: string): Promise<Approval | undefined> {
    const a = this.readAll().get(id)
    return a ? withExpiry(a, this.clock().getTime()) : undefined
  }

  async list(status?: ApprovalStatus): Promise<Approval[]> {
    const now = this.clock().getTime()
    return [...this.readAll().values()]
      .map((a) => withExpiry(a, now))
      .filter((a) => (status ? a.status === status : true))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  }

  async decide(id: string, decision: 'approved' | 'denied', note?: string): Promise<Approval> {
    const a = await this.get(id)
    if (!a) throw new ApprovalError(`No approval ${id}`)
    if (a.status !== 'pending') throw new ApprovalError(`Approval ${id} is already ${a.status}`)
    const next: Approval = {
      ...a,
      status: decision,
      decidedAt: this.clock().toISOString(),
      ...(note ? { note } : {}),
    }
    this.write(next)
    return next
  }

  async consume(id: string): Promise<Approval> {
    const a = await this.get(id)
    if (!a) throw new ApprovalError(`No approval ${id}`)
    if (a.status !== 'approved')
      throw new ApprovalError(`Approval ${id} is ${a.status}, not approved`)
    const next: Approval = { ...a, status: 'consumed' }
    this.write(next)
    return next
  }
}

/** Stable comparison so a re-call must carry the same arguments the human approved. */
export function sameInput(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const strip = (o: Record<string, unknown>): string => {
    const { approvalId: _ignored, ...rest } = o
    return JSON.stringify(rest, Object.keys(rest).sort())
  }
  return strip(a) === strip(b)
}

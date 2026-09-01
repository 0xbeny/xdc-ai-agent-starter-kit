import type { Catalog } from './catalog.ts'
import type { LedgerEntry, SpendKind } from './ledger.ts'
import { type Decision, idempotencyKey, type PaymentPolicy, type SpendIntent } from './policy.ts'
import { formatUsdc, parseUsdc } from './usdc.ts'

/** xdcai tools that move money. Everything else is read-only and passes through untouched. */
export const MONEY_TOOLS: Record<string, SpendKind> = {
  call: 'call',
  wallet_transfer: 'transfer',
  defi_swap: 'defi',
  defi_lend: 'defi',
  defi_supply: 'defi',
  add_payee_link: 'transfer',
  wallet_authorize_agent: 'transfer',
}

export interface PaymentFacts {
  paid?: bigint
  txHash?: string
  ok?: boolean
  status?: number
}

/** Pulls `paid` / `txHash` out of whatever shape the MCP tool returned (object, or JSON inside content[].text). */
export function extractPaymentFacts(result: unknown): PaymentFacts {
  const facts: PaymentFacts = {}
  const visit = (value: unknown, depth: number): void => {
    if (depth > 6 || value === null || value === undefined) return
    if (typeof value === 'string') {
      const t = value.trim()
      if (t.startsWith('{') || t.startsWith('[')) {
        try {
          visit(JSON.parse(t), depth + 1)
        } catch {
          /* plain text */
        }
      }
      return
    }
    if (Array.isArray(value)) {
      for (const v of value) visit(v, depth + 1)
      return
    }
    if (typeof value === 'object') {
      const o = value as Record<string, unknown>
      if (facts.paid === undefined && (typeof o.paid === 'string' || typeof o.paid === 'number')) {
        try {
          facts.paid = parseUsdc(o.paid)
        } catch {
          /* ignore unparsable */
        }
      }
      if (facts.txHash === undefined && typeof o.txHash === 'string') facts.txHash = o.txHash
      if (facts.ok === undefined && typeof o.ok === 'boolean') facts.ok = o.ok
      if (facts.status === undefined && typeof o.status === 'number') facts.status = o.status
      for (const v of Object.values(o)) visit(v, depth + 1)
    }
  }
  visit(result, 0)
  return facts
}

export interface GuardDeps {
  policy: PaymentPolicy
  catalog: () => Catalog | undefined
  /** Attach the current run id to ledger rows when known. */
  runId?: () => string | undefined
}

export interface GuardedExecution {
  ok: boolean
  /** Underlying tool result when the call went through. */
  result?: unknown
  decision: Decision
  entry?: LedgerEntry
  error?: string
}

export interface Guarded {
  kind: SpendKind
  /** Hooks Mastra's per-call `requireApproval`. */
  needsApproval(input: Record<string, unknown>): Promise<boolean>
  /** Runs policy + ledger around the underlying tool. */
  execute(
    input: Record<string, unknown>,
    run: (input: Record<string, unknown>) => Promise<unknown>,
  ): Promise<GuardedExecution>
}

function intentFor(
  toolName: string,
  kind: SpendKind,
  input: Record<string, unknown>,
  catalog: Catalog | undefined,
): { intent: SpendIntent; known: boolean } {
  if (kind === 'call') {
    const url = typeof input.url === 'string' ? input.url : ''
    const method = typeof input.method === 'string' ? input.method : 'GET'
    const hit = catalog?.find(url, method)
    const intent: SpendIntent = { kind, amount: hit?.price ?? 0n, url }
    if (hit) {
      intent.provider = hit.provider
      intent.capability = hit.capability
    }
    return { intent, known: hit !== undefined }
  }
  let amount = 0n
  const raw = input.amount ?? input.amountUsdc ?? input.value
  if (typeof raw === 'string' || typeof raw === 'number') {
    try {
      amount = parseUsdc(raw)
    } catch {
      amount = 0n
    }
  }
  return { intent: { kind, amount, capability: toolName }, known: true }
}

/** Wraps one money tool. Read-only tools should not be guarded. */
export function guard(toolName: string, deps: GuardDeps): Guarded {
  const kind = MONEY_TOOLS[toolName]
  if (!kind) throw new Error(`${toolName} is not a money tool`)

  const decide = async (
    input: Record<string, unknown>,
  ): Promise<{
    decision: Decision
    amount: bigint
    intent: ReturnType<typeof intentFor>['intent']
  }> => {
    const { intent, known } = intentFor(toolName, kind, input, deps.catalog())
    if (kind === 'call' && !known) {
      return {
        decision: {
          outcome: 'approve',
          reason: `no catalog price for ${intent.url || 'this URL'}; a human must confirm`,
        },
        amount: intent.amount,
        intent,
      }
    }
    return { decision: await deps.policy.evaluate(intent), amount: intent.amount, intent }
  }

  return {
    kind,
    async needsApproval(input) {
      return (await decide(input)).decision.outcome !== 'allow'
    },
    async execute(input, run) {
      const { decision, amount, intent } = await decide(input)
      if (decision.outcome === 'deny')
        return { ok: false, decision, error: `Blocked by payment policy: ${decision.reason}` }

      const key =
        kind === 'call'
          ? idempotencyKey({
              method: String(input.method ?? 'GET'),
              url: String(input.url ?? ''),
              body: input.body ?? input.params,
            })
          : undefined
      if (key) {
        const prior = await deps.policy.priorPayment(key)
        if (prior) {
          return {
            ok: false,
            decision,
            error: `This exact request was already paid at ${prior.at}${prior.txHash ? ` (tx ${prior.txHash})` : ''}. Verify it with verify_transaction instead of paying again; change the request if you really need a fresh call.`,
          }
        }
      }

      const runId = deps.runId?.()
      const pending = await deps.policy.record({
        kind,
        amount,
        status: 'pending',
        ...(intent.provider ? { provider: intent.provider } : {}),
        ...(intent.capability ? { capability: intent.capability } : {}),
        ...(intent.url ? { url: intent.url } : {}),
        ...(key ? { idempotencyKey: key } : {}),
        ...(runId ? { runId } : {}),
      })

      try {
        const result = await run(input)
        const facts = extractPaymentFacts(result)
        const failed = facts.ok === false || (facts.status !== undefined && facts.status >= 400)
        const entry = await deps.policy.record({
          ...pending,
          amount: facts.paid ?? amount,
          status: failed ? 'failed' : 'settled',
          ...(facts.txHash ? { txHash: facts.txHash } : {}),
          note: failed
            ? 'provider returned an error'
            : `paid ${formatUsdc(facts.paid ?? amount)} USDC`,
        })
        return { ok: !failed, result, decision, entry }
      } catch (error) {
        const entry = await deps.policy.record({
          ...pending,
          status: 'failed',
          note: error instanceof Error ? error.message : String(error),
        })
        return {
          ok: false,
          decision,
          entry,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
  }
}

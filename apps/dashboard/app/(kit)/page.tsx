import Link from 'next/link'

import { kitSafe } from '@/lib/api.ts'
import type { KitStatus, LedgerRow } from '@/lib/types.ts'

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-surface-2">
      <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
  )
}

export default async function Overview() {
  const { data: s } = await kitSafe<KitStatus | null>('/status', null)
  const { data: ledger } = await kitSafe<{ entries: LedgerRow[] }>('/ledger?days=7', {
    entries: [],
  })
  if (!s) return <p className="text-muted">Waiting for the agent…</p>
  const spent = Number(s.spentToday)
  const cap = Number(s.policy.dailyCap)
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="eyebrow">Overview</p>
        <h1 className="text-2xl font-semibold tracking-tight">Your agent, today</h1>
      </header>
      <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="card">
          <p className="eyebrow">Spent today</p>
          <p className="mono mt-1 text-2xl">
            {s.spentToday} <span className="text-sm text-muted">/ {s.policy.dailyCap} USDC</span>
          </p>
          <Bar value={spent} max={cap} />
        </div>
        <Link href="/approvals" className="card hover:border-accent">
          <p className="eyebrow">Waiting on you</p>
          <p className="mt-1 text-2xl">{s.pendingApprovals}</p>
          <p className="text-xs text-muted">approvals pending</p>
        </Link>
        <div className="card">
          <p className="eyebrow">Wallet</p>
          <p className="mt-2">
            <span className={`pill ${s.wallet.connected ? 'pill-ok' : 'pill-warn'}`}>
              {s.wallet.connected ? 'connected' : 'run pnpm setup'}
            </span>
          </p>
          <p className="mt-1 text-xs text-muted">XDC mainnet · USDC</p>
        </div>
        <div className="card">
          <p className="eyebrow">Model</p>
          <p className="mono mt-1 truncate text-sm" title={s.model.chat}>
            {s.model.chat}
          </p>
          {s.missingKeys?.length ? (
            <p className="mt-1 text-xs text-bad">missing: {s.missingKeys.join(', ')}</p>
          ) : (
            <p className="mt-1 text-xs text-muted">fast: {s.model.fast}</p>
          )}
        </div>
      </section>
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <p className="eyebrow">Workspace in the prompt</p>
            <Link href="/memory" className="text-xs text-accent-ink">
              edit
            </Link>
          </div>
          {s.workspace.files.length === 0 ? (
            <p className="text-sm text-muted">No workspace files yet.</p>
          ) : null}
          <ul className="flex flex-col gap-2 text-sm">
            {s.workspace.files.map((f) => (
              <li key={f.name} className="flex items-center justify-between">
                <span className="mono">{f.name}</span>
                <span className="mono text-xs text-muted">
                  {f.chars} ch{f.truncated ? ' · truncated' : ''}
                </span>
              </li>
            ))}
          </ul>
          {s.workspace.bootstrap ? (
            <p className="mt-3 text-xs text-warn">
              BOOTSTRAP.md is present — the first chat will be an introduction.
            </p>
          ) : null}
        </div>
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <p className="eyebrow">Recent spend (7 days)</p>
            <Link href="/wallet" className="text-xs text-accent-ink">
              ledger
            </Link>
          </div>
          {ledger.entries.length === 0 ? (
            <p className="text-sm text-muted">Nothing paid yet.</p>
          ) : null}
          <ul className="flex flex-col gap-2 text-sm">
            {ledger.entries.slice(0, 8).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3">
                <span className="truncate">{e.capability ?? e.provider ?? e.kind}</span>
                <span className="flex items-center gap-2">
                  <span
                    className={`pill ${e.status === 'settled' ? 'pill-ok' : e.status === 'failed' ? 'pill-bad' : 'pill-warn'}`}
                  >
                    {e.status}
                  </span>
                  <span className="mono">{e.amount}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}

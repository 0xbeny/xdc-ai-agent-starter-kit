'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import type { Approval } from '@/lib/types.ts'

export function ApprovalCard({ approval }: { approval: Approval }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function decide(decision: 'approved' | 'denied') {
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/kit/approvals/${approval.id}/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    })
    setBusy(false)
    if (!res.ok) {
      setError((await res.json().catch(() => ({ error: res.statusText }))).error ?? 'failed')
      return
    }
    router.refresh()
  }

  const pending = approval.status === 'pending'
  return (
    <article className="card flex flex-col gap-3">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">
            {approval.kind}
            {approval.amount ? ` · ${approval.amount} USDC` : ''}
          </p>
          <h3 className="mono text-sm font-semibold">{approval.tool}</h3>
        </div>
        <span
          className={`pill ${pending ? 'pill-warn' : approval.status === 'approved' || approval.status === 'consumed' ? 'pill-ok' : 'pill-muted'}`}
        >
          {approval.status}
        </span>
      </header>
      <p className="text-sm text-ink-2">{approval.reason}</p>
      <pre className="mono max-h-48 overflow-auto rounded bg-surface-2 p-3 text-xs">
        {JSON.stringify(approval.input, null, 2)}
      </pre>
      {approval.preview ? (
        <pre className="max-h-48 overflow-auto rounded border border-line p-3 text-xs whitespace-pre-wrap">
          {approval.preview}
        </pre>
      ) : null}
      <footer className="flex items-center justify-between text-xs text-muted">
        <span>
          {new Date(approval.createdAt).toLocaleString()}
          {approval.threadId ? ` · thread ${approval.threadId.slice(0, 8)}` : ''}
        </span>
        {pending ? (
          <span className="flex gap-2">
            <button className="btn" disabled={busy} onClick={() => decide('denied')}>
              Deny
            </button>
            <button className="btn-primary" disabled={busy} onClick={() => decide('approved')}>
              Approve
            </button>
          </span>
        ) : null}
      </footer>
      {error ? <p className="text-xs text-bad">{error}</p> : null}
    </article>
  )
}

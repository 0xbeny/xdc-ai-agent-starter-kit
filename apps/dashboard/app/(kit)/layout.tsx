import Link from 'next/link'
import type { ReactNode } from 'react'

import { kitSafe } from '@/lib/api.ts'
import type { KitStatus } from '@/lib/types.ts'

const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/chat', label: 'Chat' },
  { href: '/approvals', label: 'Approvals' },
  { href: '/routines', label: 'Routines' },
  { href: '/memory', label: 'Memory' },
  { href: '/wallet', label: 'Wallet' },
  { href: '/connections', label: 'Connections' },
  { href: '/settings', label: 'Settings' },
]

export default async function KitLayout({ children }: { children: ReactNode }) {
  const { data: status, error } = await kitSafe<KitStatus | null>('/status', null)
  return (
    <div className="mx-auto grid min-h-screen max-w-[1400px] grid-cols-[210px_minmax(0,1fr)]">
      <aside className="border-r border-line px-4 py-6">
        <p className="eyebrow mb-1">XDC Agent Kit</p>
        <p className="mb-6 text-sm text-muted">Watch, steer, approve.</p>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded px-2 py-1.5 text-sm hover:bg-surface-2"
            >
              {n.label}
              {n.href === '/approvals' && status && status.pendingApprovals > 0 ? (
                <span className="pill pill-warn ml-2">{status.pendingApprovals}</span>
              ) : null}
            </Link>
          ))}
        </nav>
        <div className="mt-8 flex flex-col gap-2 text-xs text-muted">
          {status ? (
            <>
              <span className="mono truncate" title={status.model.chat}>
                {status.model.chat}
              </span>
              <span className={`pill ${status.wallet.connected ? 'pill-ok' : 'pill-muted'}`}>
                {status.wallet.connected ? 'wallet connected' : 'wallet not connected'}
              </span>
            </>
          ) : (
            <span className="pill pill-bad">agent offline</span>
          )}
        </div>
      </aside>
      <main className="px-8 py-6">
        {error ? (
          <div className="card mb-6 border-bad text-sm">
            <b>Agent unreachable.</b> Start it with <code className="mono">pnpm dev</code> (expected
            at {process.env.AGENT_URL ?? 'http://localhost:4111'}).
            <div className="mt-1 text-xs text-muted">{error}</div>
          </div>
        ) : null}
        {children}
      </main>
    </div>
  )
}

import { kitSafe } from '@/lib/api.ts'
import type { KitStatus } from '@/lib/types.ts'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const { data: s } = await kitSafe<(KitStatus & { missingKeys?: string[] }) | null>(
    '/status',
    null,
  )
  if (!s) return <p className="text-muted">Waiting for the agent…</p>
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="eyebrow">Settings</p>
        <h1 className="text-2xl font-semibold tracking-tight">How this agent is wired</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Values come from <code className="mono">.env</code>. Change them with{' '}
          <code className="mono">pnpm setup</code> (re-runnable) and restart the agent.
        </p>
      </header>
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="card">
          <p className="eyebrow mb-2">Models</p>
          <dl className="grid grid-cols-[80px_1fr] gap-y-1 text-sm">
            <dt className="text-muted">chat</dt>
            <dd className="mono truncate">{s.model.chat}</dd>
            <dt className="text-muted">fast</dt>
            <dd className="mono truncate">{s.model.fast}</dd>
            <dt className="text-muted">embed</dt>
            <dd className="mono truncate">{s.model.embed ?? '— (RAG not enabled)'}</dd>
          </dl>
          {s.missingKeys?.length ? (
            <p className="mt-2 text-xs text-bad">Missing keys: {s.missingKeys.join(', ')}</p>
          ) : (
            <p className="mt-2 text-xs text-good">All provider keys present.</p>
          )}
        </div>
        <div className="card">
          <p className="eyebrow mb-2">Payment policy</p>
          <dl className="grid grid-cols-[170px_1fr] gap-y-1 text-sm">
            <dt className="text-muted">auto-approve below</dt>
            <dd className="mono">{s.policy.autoApproveBelow} USDC</dd>
            <dt className="text-muted">per-call max</dt>
            <dd className="mono">{s.policy.perCallMax} USDC</dd>
            <dt className="text-muted">daily cap</dt>
            <dd className="mono">{s.policy.dailyCap} USDC</dd>
            <dt className="text-muted">providers</dt>
            <dd className="mono">{s.policy.allowedProviders?.join(', ') ?? 'any'}</dd>
          </dl>
        </div>
        <div className="card md:col-span-2">
          <p className="eyebrow mb-2">Workspace</p>
          <p className="mono text-sm">{s.workspace.dir}</p>
          {s.workspace.missing.length ? (
            <p className="mt-1 text-xs text-muted">
              Not written yet: {s.workspace.missing.join(', ')}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  )
}

import { ApprovalCard } from '@/components/ApprovalCard.tsx'
import { kitSafe } from '@/lib/api.ts'
import type { Approval } from '@/lib/types.ts'

export const dynamic = 'force-dynamic'

export default async function ApprovalsPage() {
  const { data } = await kitSafe<{ approvals: Approval[] }>('/approvals', { approvals: [] })
  const pending = data.approvals.filter((a) => a.status === 'pending')
  const past = data.approvals.filter((a) => a.status !== 'pending').slice(0, 30)
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="eyebrow">Approvals</p>
        <h1 className="text-2xl font-semibold tracking-tight">Waiting on you</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Payments at or above your threshold, every transfer and DeFi action, and anything the
          policy could not price stop here. Approving lets the agent run that exact call once; it
          must call again with the approval id.
        </p>
      </header>
      {pending.length === 0 ? <p className="card text-sm text-muted">Nothing pending.</p> : null}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {pending.map((a) => (
          <ApprovalCard key={a.id} approval={a} />
        ))}
      </section>
      {past.length > 0 ? (
        <section>
          <p className="eyebrow mb-3">History</p>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {past.map((a) => (
              <ApprovalCard key={a.id} approval={a} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

import { kitSafe } from '@/lib/api.ts'

export const dynamic = 'force-dynamic'

interface Routine {
  id: string
  agentId?: string
  cron: string
  prompt?: string
  timezone?: string
  status: string
  nextRunAt?: string
  lastRunAt?: string
  lastRunStatus?: string
}

interface RoutineRun {
  id: string
  at: string
  name?: string
  status: 'ok' | 'error'
  text?: string
  error?: string
}

const EXAMPLES: [string, string][] = [
  [
    '57 7 * * 1-5',
    "Every weekday morning: summarise unread mail and today's calendar; flag anything that needs me.",
  ],
  [
    '*/30 * * * *',
    'Check XDC gas price via the marketplace and log it; alert me if it is above 1 gwei.',
  ],
  ['3 9 * * 1', 'Monday: review the last week of the ledger and tell me where money went.'],
]

export default async function RoutinesPage() {
  const { data, error } = await kitSafe<{ routines: Routine[]; runs: RoutineRun[] }>('/routines', {
    routines: [],
    runs: [],
  })
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="eyebrow">Routines</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Things the agent does on a schedule
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Cron-timed prompts run by the assistant while the agent server is up. Anything that costs
          money or sends still stops in Approvals.
        </p>
      </header>
      {error ? <p className="card text-sm text-bad">{error}</p> : null}
      <section className="card">
        <p className="eyebrow mb-3">New routine</p>
        <form
          method="post"
          action="/api/kit/routines"
          className="grid grid-cols-1 gap-3 md:grid-cols-[200px_1fr_auto]"
        >
          <input
            name="cron"
            placeholder="cron, e.g. 57 7 * * 1-5"
            className="input mono"
            required
          />
          <input name="prompt" placeholder="what should the agent do?" className="input" required />
          <button className="btn-primary">Create</button>
        </form>
        <ul className="mt-3 flex flex-col gap-1 text-xs text-muted">
          {EXAMPLES.map(([cron, prompt]) => (
            <li key={cron}>
              <span className="mono">{cron}</span> — {prompt}
            </li>
          ))}
        </ul>
      </section>
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {data.routines.length === 0 ? <p className="text-sm text-muted">No routines yet.</p> : null}
        {data.routines.map((r) => (
          <article key={r.id} className="card flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="mono text-sm">
                {r.cron}
                {r.timezone ? ` · ${r.timezone}` : ''}
              </span>
              <span className={`pill ${r.status === 'active' ? 'pill-ok' : 'pill-muted'}`}>
                {r.status}
              </span>
            </div>
            <p className="text-sm">{r.prompt}</p>
            <p className="text-xs text-muted">
              next {r.nextRunAt ? new Date(r.nextRunAt).toLocaleString() : '—'}
              {r.lastRunAt
                ? ` · last ${new Date(r.lastRunAt).toLocaleString()} (${r.lastRunStatus ?? '?'})`
                : ''}
            </p>
            <div className="flex gap-2">
              {(['run', r.status === 'active' ? 'pause' : 'resume', 'delete'] as const).map((a) => (
                <form key={a} method="post" action={`/api/kit/routines/${r.id}/${a}`}>
                  <button className="btn">{a}</button>
                </form>
              ))}
            </div>
          </article>
        ))}
      </section>
      <section className="card">
        <p className="eyebrow mb-3">Recent runs</p>
        {data.runs.length === 0 ? <p className="text-sm text-muted">No runs yet.</p> : null}
        <ul className="flex flex-col gap-3">
          {data.runs.map((run) => (
            <li
              key={run.id}
              className="border-t border-line pt-2 text-sm first:border-t-0 first:pt-0"
            >
              <div className="flex items-center justify-between text-xs text-muted">
                <span>
                  {new Date(run.at).toLocaleString()}
                  {run.name ? ` · ${run.name}` : ''}
                </span>
                <span className={`pill ${run.status === 'ok' ? 'pill-ok' : 'pill-bad'}`}>
                  {run.status}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap">
                {run.status === 'ok' ? (run.text ?? '(no output)') : run.error}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

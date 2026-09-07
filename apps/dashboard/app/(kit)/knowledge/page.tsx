import { kitSafe } from '@/lib/api.ts'

export const dynamic = 'force-dynamic'

interface Hit {
  text: string
  source: string
  score: number
}
interface Sources {
  enabled: boolean
  sources: { source: string; chunks: number; addedAt: string }[]
}

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; added?: string; chunks?: string }>
}) {
  const params = await searchParams
  const q = params.q?.trim() ?? ''
  const { data } = await kitSafe<Sources | null>('/knowledge', null)
  const search = q
    ? await kitSafe<{ hits: Hit[] } | null>(`/knowledge/search?q=${encodeURIComponent(q)}`, null)
    : null
  if (!data) return <p className="text-muted">Waiting for the agent…</p>
  if (!data.enabled)
    return (
      <div>
        <p className="eyebrow">Knowledge</p>
        <h1 className="text-2xl font-semibold tracking-tight">Knowledge base is off</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Set an embedding model to enable it: run <code className="mono">xdc-agent setup</code> and
          say yes to the knowledge step (adds <code className="mono">MODEL_EMBED</code> to{' '}
          <code className="mono">.env</code>), then restart the agent.
        </p>
      </div>
    )
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="eyebrow">Knowledge</p>
        <h1 className="text-2xl font-semibold tracking-tight">What your agent can look up</h1>
        {params.added ? (
          <p className="mt-1 text-sm text-good">
            Stored “{params.added}” ({params.chunks} chunks)
          </p>
        ) : null}
      </header>

      <form method="get" className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search the knowledge base…"
          className="w-full max-w-xl rounded border border-line bg-surface px-3 py-2 text-sm"
        />
        <button className="rounded border border-line px-4 py-2 text-sm hover:bg-surface-2">
          Search
        </button>
      </form>
      {search?.data ? (
        <section className="flex flex-col gap-2">
          {search.data.hits.length === 0 ? (
            <p className="text-sm text-muted">No matches.</p>
          ) : (
            search.data.hits.map((h, i) => (
              <div key={i} className="card">
                <p className="text-xs text-muted">
                  {h.source} · score {h.score.toFixed(3)}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{h.text}</p>
              </div>
            ))
          )}
        </section>
      ) : null}

      <section>
        <p className="eyebrow mb-2">Add text</p>
        <form
          method="post"
          action="/api/kit/knowledge/add"
          className="flex max-w-xl flex-col gap-2"
        >
          <input
            name="source"
            required
            placeholder="Source name (e.g. onboarding-notes)"
            className="rounded border border-line bg-surface px-3 py-2 text-sm"
          />
          <textarea
            name="text"
            required
            rows={6}
            placeholder="Paste the text to remember…"
            className="rounded border border-line bg-surface px-3 py-2 text-sm"
          />
          <button className="self-start rounded border border-line px-4 py-2 text-sm hover:bg-surface-2">
            Store
          </button>
        </form>
      </section>

      <section>
        <p className="eyebrow mb-2">Sources ({data.sources.length})</p>
        {data.sources.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing stored yet — add text above, or tell the agent “remember this document”.
          </p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {data.sources.map((s) => (
                <tr key={s.source} className="border-t border-line">
                  <td className="py-2 pr-3">{s.source}</td>
                  <td className="py-2 pr-3 text-muted">{s.chunks} chunks</td>
                  <td className="py-2 pr-3 text-muted">{s.addedAt.slice(0, 16)}</td>
                  <td className="py-2 text-right">
                    <form method="post" action="/api/kit/knowledge/remove">
                      <input type="hidden" name="source" value={s.source} />
                      <button className="text-xs text-muted hover:text-bad">remove</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

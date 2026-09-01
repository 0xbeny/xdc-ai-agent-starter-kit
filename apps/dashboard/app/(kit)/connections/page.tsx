import { kitSafe } from '@/lib/api.ts'
import type { ConnectorInfo } from '@/lib/types.ts'

export const dynamic = 'force-dynamic'

export default async function ConnectionsPage() {
  const { data } = await kitSafe<{ connectors: ConnectorInfo[] }>('/connectors', { connectors: [] })
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="eyebrow">Connections</p>
        <h1 className="text-2xl font-semibold tracking-tight">Workplace tools</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Each connection is a vendor-hosted MCP server reached with your own OAuth grant. Reading
          is automatic; writing needs approval; sending shows a preview first.
        </p>
      </header>
      {data.connectors.length === 0 ? (
        <p className="card text-sm text-muted">No connectors registered yet.</p>
      ) : null}
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {data.connectors.map((c) => (
          <li key={c.id} className="card flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <b>{c.label}</b>
              <span className={`pill ${c.connected ? 'pill-ok' : 'pill-muted'}`}>
                {c.connected
                  ? `connected${c.toolCount ? ` · ${c.toolCount} tools` : ''}`
                  : 'not connected'}
              </span>
            </div>
            <p className="text-sm text-ink-2">{c.description}</p>
            {c.needsClientCredentials && !c.connected ? (
              <p className="text-xs text-warn">
                Needs {c.id.toUpperCase().replace(/-/g, '_')}_OAUTH_CLIENT_ID / _SECRET in .env
                first.
              </p>
            ) : null}
            <form
              method="post"
              action={`/api/kit/connectors/${c.id}/${c.connected ? 'disconnect' : 'connect'}`}
            >
              <button className={c.connected ? 'btn' : 'btn-primary'}>
                {c.connected ? 'Disconnect' : 'Connect'}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  )
}

import { kitSafe } from '@/lib/api.ts'
import type { LedgerRow, MarketplaceEntry, WalletInfo } from '@/lib/types.ts'

export const dynamic = 'force-dynamic'

export default async function WalletPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q = '' } = await searchParams
  const [{ data: wallet }, { data: ledger }, { data: market }] = await Promise.all([
    kitSafe<WalletInfo & { address?: unknown; balance?: unknown }>('/wallet', { connected: false }),
    kitSafe<{ entries: LedgerRow[]; spentToday: string }>('/ledger?days=30', {
      entries: [],
      spentToday: '0',
    }),
    kitSafe<{ entries: MarketplaceEntry[]; note?: string }>(
      `/marketplace?search=${encodeURIComponent(q)}`,
      { entries: [] },
    ),
  ])
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="eyebrow">Wallet</p>
        <h1 className="text-2xl font-semibold tracking-tight">Money in, money out</h1>
      </header>
      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="card md:col-span-2">
          <p className="eyebrow">XDC AI smart wallet · mainnet</p>
          {!wallet.connected ? (
            <p className="mt-2 text-sm text-muted">
              Not connected. Run <code className="mono">pnpm setup</code> or{' '}
              <code className="mono">pnpm login</code> in the repo.
            </p>
          ) : null}
          {wallet.error ? <p className="mt-2 text-sm text-bad">{wallet.error}</p> : null}
          {wallet.connected && !wallet.error ? (
            <div className="mt-2 grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
              <pre className="mono overflow-auto rounded bg-surface-2 p-2">
                {JSON.stringify(wallet.address, null, 2)}
              </pre>
              <pre className="mono overflow-auto rounded bg-surface-2 p-2">
                {JSON.stringify(wallet.balance, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
        <div className="card">
          <p className="eyebrow">Spent today</p>
          <p className="mono mt-1 text-2xl">
            {ledger.spentToday} <span className="text-sm text-muted">USDC</span>
          </p>
        </div>
      </section>
      <section className="card">
        <p className="eyebrow mb-3">Ledger · 30 days</p>
        {ledger.entries.length === 0 ? (
          <p className="text-sm text-muted">No paid calls yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-1 pr-3">When</th>
                  <th className="pr-3">What</th>
                  <th className="pr-3">Provider</th>
                  <th className="pr-3">Status</th>
                  <th className="pr-3 text-right">USDC</th>
                  <th>Tx</th>
                </tr>
              </thead>
              <tbody>
                {ledger.entries.map((e) => (
                  <tr key={e.id} className="border-t border-line">
                    <td className="mono py-1.5 pr-3 text-xs">{new Date(e.at).toLocaleString()}</td>
                    <td className="pr-3">{e.capability ?? e.kind}</td>
                    <td className="pr-3 text-muted">{e.provider ?? '—'}</td>
                    <td className="pr-3">
                      <span
                        className={`pill ${e.status === 'settled' ? 'pill-ok' : e.status === 'failed' ? 'pill-bad' : 'pill-warn'}`}
                      >
                        {e.status}
                      </span>
                    </td>
                    <td className="mono pr-3 text-right">{e.amount}</td>
                    <td className="mono text-xs">
                      {e.txHash ? (
                        <a
                          className="text-accent-ink"
                          href={`https://xdcscan.com/tx/${e.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {e.txHash.slice(0, 10)}…
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="card">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="eyebrow">Marketplace · pay-per-call APIs</p>
          <form className="flex gap-2">
            <input
              name="q"
              defaultValue={q}
              placeholder="search: compliance, masternode, gas…"
              className="input w-72"
            />
            <button className="btn">Search</button>
          </form>
        </div>
        {market.note ? <p className="text-sm text-muted">{market.note}</p> : null}
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {market.entries.slice(0, 60).map((m) => (
            <li key={m.id} className="rounded border border-line p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <b className="truncate">{m.provider}</b>
                <span className="mono text-xs">{m.price} USDC</span>
              </div>
              <p className="text-ink-2">{m.capability}</p>
              <p className="mono mt-1 truncate text-xs text-muted" title={m.url}>
                {m.method} {m.url.replace('https://api.xdcai.tech/x402/connect/', '…/')}
              </p>
              <p className="mt-1 text-xs text-muted">
                {m.calls} calls · {m.volumeUsdc} USDC volume
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

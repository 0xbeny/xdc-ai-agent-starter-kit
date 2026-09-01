import { parseUsdc } from './usdc.ts'

export interface CatalogEntry {
  id: string
  provider: string
  capability: string
  method: string
  url: string
  /** micro-USDC */
  price: bigint
  payTo?: string
  tags: string[]
  calls: number
  volumeUsdc: number
}

interface RawMarketplaceItem {
  id?: unknown
  provider?: unknown
  capability?: unknown
  method?: unknown
  url?: unknown
  price?: unknown
  payTo?: unknown
  tags?: unknown
  calls?: unknown
  volumeUSDC?: unknown
}

/** Accepts "0.01 USDC", "0 USDC", "0.01", { usdc: "0.01" } or { atomic: "100" }. */
export function parsePrice(price: unknown): bigint {
  if (typeof price === 'string' || typeof price === 'number') return parseUsdc(price)
  if (price && typeof price === 'object') {
    const p = price as { usdc?: unknown; atomic?: unknown }
    if (typeof p.usdc === 'string' || typeof p.usdc === 'number') return parseUsdc(p.usdc)
    if (typeof p.atomic === 'string' || typeof p.atomic === 'number') return BigInt(p.atomic)
  }
  throw new Error(`Unrecognised price: ${JSON.stringify(price)}`)
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v.trim() : fallback
}

export function parseCatalog(items: unknown): CatalogEntry[] {
  if (!Array.isArray(items)) return []
  const out: CatalogEntry[] = []
  for (const raw of items as RawMarketplaceItem[]) {
    const url = str(raw.url)
    if (!url) continue
    let price: bigint
    try {
      price = parsePrice(raw.price)
    } catch {
      continue
    }
    const entry: CatalogEntry = {
      id: str(raw.id, url),
      provider: str(raw.provider, 'unknown'),
      capability: str(raw.capability),
      method: str(raw.method, 'GET').toUpperCase(),
      url,
      price,
      tags: Array.isArray(raw.tags)
        ? raw.tags.filter((t): t is string => typeof t === 'string')
        : [],
      calls: typeof raw.calls === 'number' ? raw.calls : 0,
      volumeUsdc: typeof raw.volumeUSDC === 'number' ? raw.volumeUSDC : 0,
    }
    const payTo = str(raw.payTo)
    if (payTo) entry.payTo = payTo
    out.push(entry)
  }
  return out
}

/** Turns "https://h/v1/node/:address/status" into a matcher for concrete URLs (query string ignored). */
function templateToRegex(template: string): RegExp {
  const escaped = template
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\:[A-Za-z_][A-Za-z0-9_]*/g, '[^/?#]+')
  // the escape above turned ":id" into "\:id"; handle the un-escaped form as well
  const withParams = escaped.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, '[^/?#]+')
  return new RegExp(`^${withParams}(?:[?#].*)?$`)
}

export class Catalog {
  private readonly matchers: { entry: CatalogEntry; re: RegExp }[]

  readonly entries: CatalogEntry[]

  constructor(entries: CatalogEntry[]) {
    this.entries = entries
    this.matchers = entries.map((entry) => ({ entry, re: templateToRegex(entry.url) }))
  }

  static from(items: unknown): Catalog {
    return new Catalog(parseCatalog(items))
  }

  /** Exact or template match on URL; prefers exact, then the longest template. */
  find(url: string, method = 'GET'): CatalogEntry | undefined {
    const m = method.toUpperCase()
    const exact = this.entries.find((e) => e.url === url && e.method === m)
    if (exact) return exact
    const candidates = this.matchers.filter(({ entry, re }) => entry.method === m && re.test(url))
    candidates.sort((a, b) => b.entry.url.length - a.entry.url.length)
    return candidates[0]?.entry
  }

  search(terms: string): CatalogEntry[] {
    const words = terms
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(Boolean)
    if (words.length === 0) return [...this.entries]
    const score = (e: CatalogEntry): number => {
      const hay = `${e.provider} ${e.capability} ${e.tags.join(' ')} ${e.url}`.toLowerCase()
      return words.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0)
    }
    return this.entries
      .map((e) => ({ e, s: score(e) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || b.e.calls - a.e.calls)
      .map((x) => x.e)
  }
}

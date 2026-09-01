/** Line-preserving .env editing: known keys are updated in place, new keys appended, comments kept. */
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!m) continue
    const key = m[1] as string
    let value = (m[2] ?? '').trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

function quote(value: string): string {
  return /[\s#'"\\]/.test(value) ? JSON.stringify(value) : value
}

export function mergeEnv(existing: string, updates: Record<string, string | undefined>): string {
  const lines = existing === '' ? [] : existing.split(/\r?\n/)
  const pending = new Map(
    Object.entries(updates).filter(([, v]) => v !== undefined) as [string, string][],
  )
  const merged = lines.map((line) => {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)
    if (!m) return line
    const key = m[1] as string
    if (!pending.has(key)) return line
    const value = pending.get(key) as string
    pending.delete(key)
    return `${key}=${quote(value)}`
  })
  if (pending.size > 0) {
    if (merged.length > 0 && merged[merged.length - 1] !== '') merged.push('')
    merged.push('# added by pnpm setup')
    for (const [key, value] of pending) merged.push(`${key}=${quote(value)}`)
  }
  const text = merged.join('\n')
  return text.endsWith('\n') ? text : `${text}\n`
}

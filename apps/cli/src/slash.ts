export type SlashCommand =
  | { kind: 'message'; text: string }
  | { kind: 'new' }
  | { kind: 'approvals' }
  | { kind: 'approve'; id: string }
  | { kind: 'deny'; id: string }
  | { kind: 'status' }
  | { kind: 'help' }
  | { kind: 'quit' }
  | { kind: 'unknown'; text: string }

/** Parses one REPL line. Anything not starting with "/" is a message to the agent. */
export function parseSlash(line: string): SlashCommand {
  const text = line.trim()
  if (!text.startsWith('/')) return { kind: 'message', text }
  const [cmd = '', ...rest] = text.slice(1).split(/\s+/)
  const arg = rest.join(' ').trim()
  switch (cmd.toLowerCase()) {
    case 'new':
    case 'reset':
      return { kind: 'new' }
    case 'approvals':
    case 'pending':
      return { kind: 'approvals' }
    case 'approve':
      return arg ? { kind: 'approve', id: arg } : { kind: 'unknown', text }
    case 'deny':
      return arg ? { kind: 'deny', id: arg } : { kind: 'unknown', text }
    case 'status':
      return { kind: 'status' }
    case 'help':
    case '?':
      return { kind: 'help' }
    case 'quit':
    case 'exit':
    case 'q':
      return { kind: 'quit' }
    default:
      return { kind: 'unknown', text }
  }
}

/** Approval ids are UUIDs; let people type the 8-char prefix the dashboard/Telegram show. */
export function matchApprovalId<T extends { id: string }>(
  items: T[],
  idOrPrefix: string,
): T | undefined {
  const exact = items.find((a) => a.id === idOrPrefix)
  if (exact) return exact
  const hits = items.filter((a) => a.id.startsWith(idOrPrefix))
  return hits.length === 1 ? hits[0] : undefined
}

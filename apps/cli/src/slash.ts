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

export const SLASH_COMMANDS: { name: string; arg?: string; help: string }[] = [
  { name: '/new', help: 'start a fresh conversation (long-term memory is kept)' },
  { name: '/approvals', help: 'list pending approvals' },
  { name: '/approve', arg: '<id>', help: 'approve a pending action (id or 8-char prefix)' },
  { name: '/deny', arg: '<id>', help: 'deny a pending action' },
  { name: '/status', help: 'model, wallet, workspace, skills, spend' },
  { name: '/help', help: 'this list' },
  { name: '/quit', help: 'leave the chat' },
]

/** readline completer: only completes the command word; returns [matches, textToReplace]. */
export function completeSlash(line: string): [string[], string] {
  if (!line.startsWith('/') || /\s/.test(line)) return [[], line]
  const matches = SLASH_COMMANDS.map((c) => c.name).filter((n) => n.startsWith(line))
  return [matches.length ? matches : [], line]
}

export function slashHelpLines(): string[] {
  const width = Math.max(
    ...SLASH_COMMANDS.map((c) => `${c.name}${c.arg ? ` ${c.arg}` : ''}`.length),
  )
  return SLASH_COMMANDS.map(
    (c) => `${`${c.name}${c.arg ? ` ${c.arg}` : ''}`.padEnd(width + 2)}${c.help}`,
  )
}

export type SlashCommand =
  | { kind: 'message'; text: string }
  | { kind: 'new' }
  | { kind: 'approvals' }
  | { kind: 'approve'; id: string }
  | { kind: 'deny'; id: string }
  | { kind: 'status' }
  | { kind: 'model'; spec?: string }
  | { kind: 'skills' }
  | { kind: 'skill'; name: string }
  | { kind: 'tools' }
  | { kind: 'wallet' }
  | { kind: 'memory' }
  | { kind: 'usage' }
  | { kind: 'routines' }
  | { kind: 'retry' }
  | { kind: 'dashboard' }
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
    case 'model':
      return arg ? { kind: 'model', spec: arg } : { kind: 'model' }
    case 'skills':
      return { kind: 'skills' }
    case 'skill':
      return arg ? { kind: 'skill', name: arg } : { kind: 'unknown', text }
    case 'tools':
      return { kind: 'tools' }
    case 'wallet':
      return { kind: 'wallet' }
    case 'memory':
      return { kind: 'memory' }
    case 'usage':
      return { kind: 'usage' }
    case 'routines':
    case 'cron':
      return { kind: 'routines' }
    case 'retry':
      return { kind: 'retry' }
    case 'dashboard':
    case 'ui':
      return { kind: 'dashboard' }
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
  { name: '/retry', help: 'send the last message again' },
  { name: '/approvals', help: 'list pending approvals' },
  { name: '/approve', arg: '<id>', help: 'approve a pending action (id or 8-char prefix)' },
  { name: '/deny', arg: '<id>', help: 'deny a pending action' },
  {
    name: '/model',
    arg: '[provider/model]',
    help: 'show the chat model, or switch it (saved to .env; restart to apply)',
  },
  { name: '/usage', help: 'tokens used by the last reply and USDC spent today' },
  { name: '/wallet', help: 'XDC AI wallet: address, balances, caps, spend' },
  { name: '/skills', help: 'list bundled and custom skills' },
  { name: '/skill', arg: '<name>', help: 'read one skill' },
  { name: '/tools', help: 'tools the agent can call right now' },
  { name: '/memory', help: 'show MEMORY.md (what the agent chose to remember)' },
  { name: '/routines', help: 'scheduled routines (cron) and recent runs' },
  {
    name: '/dashboard',
    help: 'start the web UI if needed and open it (or print the ssh tunnel command)',
  },
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

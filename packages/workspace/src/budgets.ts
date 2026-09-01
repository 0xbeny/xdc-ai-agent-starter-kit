export const WORKSPACE_FILES = [
  'SOUL.md',
  'IDENTITY.md',
  'USER.md',
  'AGENTS.md',
  'BOOTSTRAP.md',
  'MEMORY.md',
] as const
export type WorkspaceFile = (typeof WORKSPACE_FILES)[number]

export const DEFAULT_BUDGETS: Record<WorkspaceFile, number> = {
  'SOUL.md': 6000,
  'IDENTITY.md': 600,
  'USER.md': 4000,
  'AGENTS.md': 8000,
  'BOOTSTRAP.md': 3000,
  'MEMORY.md': 2500,
}
export const DEFAULT_TOTAL_BUDGET = 20000
export const DAILY_LOG_BUDGET = 3000

export interface Truncation {
  text: string
  truncated: boolean
  dropped: number
}

/** Keeps ~70% from the head and ~20% from the tail (Hermes-style) with a visible marker between. */
export function truncate(text: string, max: number): Truncation {
  if (text.length <= max) return { text, truncated: false, dropped: 0 }
  const marker = (n: number): string => `\n\n[... ${n} characters truncated ...]\n\n`
  // the marker itself must fit inside `max`; size it for the worst case (dropping everything)
  const budget = max - marker(text.length).length
  if (budget <= 0) return { text: text.slice(0, max), truncated: true, dropped: text.length - max }
  const headLen = Math.floor((budget * 7) / 9)
  const tailLen = budget - headLen
  const dropped = text.length - headLen - tailLen
  const head = text.slice(0, headLen)
  const tail = tailLen > 0 ? text.slice(text.length - tailLen) : ''
  return { text: `${head}${marker(dropped)}${tail}`, truncated: true, dropped }
}

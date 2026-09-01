import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import {
  DAILY_LOG_BUDGET,
  DEFAULT_BUDGETS,
  DEFAULT_TOTAL_BUDGET,
  truncate,
  type WorkspaceFile,
} from './budgets.ts'
import { dailyLogName } from './memory.ts'

export interface LoadedFile {
  name: string
  text: string
  chars: number
  truncated: boolean
}

export interface LoadedWorkspace {
  dir: string
  /** Files in injection order: SOUL → IDENTITY → USER → AGENTS → BOOTSTRAP (new only) → MEMORY → daily logs. */
  files: LoadedFile[]
  missing: WorkspaceFile[]
  /** Present on disk but skipped because the total budget was already spent. */
  omitted: string[]
  bootstrap: boolean
  /** System-prompt text: SOUL.md verbatim first, then the rest in tagged blocks. */
  prompt: string
  totalChars: number
}

export interface LoadOptions {
  now?: Date
  budgets?: Partial<Record<WorkspaceFile, number>>
  totalBudget?: number
}

/** Below this many characters a file fragment is noise; skip it and report it instead. */
const MIN_USEFUL_CHARS = 120

const ORDER: WorkspaceFile[] = [
  'SOUL.md',
  'IDENTITY.md',
  'USER.md',
  'AGENTS.md',
  'BOOTSTRAP.md',
  'MEMORY.md',
]
const OPTIONAL: WorkspaceFile[] = ['IDENTITY.md', 'USER.md', 'MEMORY.md', 'BOOTSTRAP.md']

function readIfExists(path: string): string | null {
  return existsSync(path) ? readFileSync(path, 'utf8').trim() : null
}

export function loadWorkspace(workspaceDir: string, options: LoadOptions = {}): LoadedWorkspace {
  const dir = resolve(workspaceDir)
  const now = options.now ?? new Date()
  const budgets = { ...DEFAULT_BUDGETS, ...options.budgets }
  const total = options.totalBudget ?? DEFAULT_TOTAL_BUDGET

  const files: LoadedFile[] = []
  const missing: WorkspaceFile[] = []
  let remaining = total

  const omitted: string[] = []
  const push = (name: string, raw: string, budget: number): void => {
    const cap = Math.min(budget, remaining)
    if (cap < MIN_USEFUL_CHARS) {
      omitted.push(name)
      return
    }
    const out = truncate(raw, cap)
    files.push({ name, text: out.text, chars: out.text.length, truncated: out.truncated })
    remaining -= out.text.length
  }

  for (const name of ORDER) {
    const raw = readIfExists(join(dir, name))
    if (raw === null || raw === '') {
      if (name !== 'BOOTSTRAP.md') missing.push(name)
      continue
    }
    push(name, raw, budgets[name])
  }

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  for (const day of [now, yesterday]) {
    const name = `memory/${dailyLogName(day)}`
    const raw = readIfExists(join(dir, name))
    if (raw) push(name, raw, DAILY_LOG_BUDGET)
  }

  const bootstrap = files.some((f) => f.name === 'BOOTSTRAP.md')
  return {
    dir,
    files,
    missing,
    bootstrap,
    omitted,
    prompt: renderPrompt(files, missing),
    totalChars: total - remaining,
  }
}

function renderPrompt(files: LoadedFile[], missing: WorkspaceFile[]): string {
  if (files.length === 0) {
    return 'You are a helpful, direct assistant. Say when you do not know something.'
  }
  const soul = files.find((f) => f.name === 'SOUL.md')
  const rest = files.filter((f) => f.name !== 'SOUL.md')
  const parts: string[] = []
  if (soul) parts.push(soul.text)
  if (rest.length > 0 || missing.length > 0) {
    const blocks = rest.map((f) => `<file name="${f.name}">\n${f.text}\n</file>`)
    const notYet = missing.filter((m) => OPTIONAL.includes(m))
    if (notYet.length > 0) blocks.push(`<missing>${notYet.join(', ')} not written yet</missing>`)
    parts.push(`# Workspace\n\n${blocks.join('\n\n')}`)
  }
  return parts.join('\n\n')
}

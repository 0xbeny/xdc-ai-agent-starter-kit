import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * Phase 0 loader: SOUL.md then AGENTS.md, verbatim.
 * Budgets, IDENTITY/USER/MEMORY, daily logs and progressive discovery arrive with @xdc-ai/workspace in Phase 1.
 */
export function loadInstructions(workspaceDir: string): string {
  const root = resolve(workspaceDir)
  const parts = ['SOUL.md', 'AGENTS.md']
    .map((name) => join(root, name))
    .filter((path) => existsSync(path))
    .map((path) => readFileSync(path, 'utf8').trim())
    .filter((text) => text.length > 0)

  if (parts.length === 0) {
    return 'You are a helpful, direct assistant. Say when you do not know something.'
  }
  return parts.join('\n\n')
}

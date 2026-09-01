import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

const ROOT_MARKER = 'pnpm-workspace.yaml'

/** Nearest ancestor (inclusive) containing pnpm-workspace.yaml, or null. */
export function findRepoRoot(start: string): string | null {
  let dir = resolve(start)
  for (;;) {
    if (existsSync(join(dir, ROOT_MARKER))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/**
 * `mastra dev` runs with cwd = apps/agent, while .env paths are written relative to the repo.
 * Resolve relative paths against the repo root so both `pnpm dev` and a built server agree.
 */
export function resolveFromRoot(path: string, start: string = process.cwd()): string {
  if (isAbsolute(path)) return path
  return resolve(findRepoRoot(start) ?? start, path)
}

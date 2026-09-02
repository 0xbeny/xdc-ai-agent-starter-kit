import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** The CLI resumes the same conversation across restarts; /new rotates to a fresh one. */
export function threadFile(dataDir: string): string {
  return join(dataDir, 'cli-thread')
}

export function loadOrCreateThread(dataDir: string): { thread: string; resumed: boolean } {
  const file = threadFile(dataDir)
  if (existsSync(file)) {
    const t = readFileSync(file, 'utf8').trim()
    if (t) return { thread: t, resumed: true }
  }
  return { thread: rotateThread(dataDir), resumed: false }
}

export function rotateThread(dataDir: string): string {
  const thread = `cli:${Date.now()}-${randomUUID().slice(0, 8)}`
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(threadFile(dataDir), `${thread}\n`)
  return thread
}

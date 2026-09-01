import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

export class MemoryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MemoryError'
  }
}

export interface MemoryChange {
  action: 'add' | 'replace' | 'remove'
  before: string
  after: string
  size: number
  max: number
}

function atomicWrite(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, text)
  renameSync(tmp, path)
}

/**
 * Curated, size-capped MEMORY.md — one bullet per durable fact.
 * The agent edits it only through add/replace/remove; there is no free-form write.
 */
export class CuratedMemory {
  readonly path: string
  readonly max: number

  constructor(workspaceDir: string, options: { max?: number } = {}) {
    this.path = join(workspaceDir, 'MEMORY.md')
    this.max = options.max ?? 2500
  }

  read(): string {
    return existsSync(this.path) ? readFileSync(this.path, 'utf8') : ''
  }

  size(): number {
    return this.read().length
  }

  add(text: string): MemoryChange {
    const fact = normalize(text)
    const before = this.read()
    const lines = nonEmptyLines(before)
    if (lines.some((line) => line === `- ${fact}`)) {
      throw new MemoryError('That fact is already in memory')
    }
    const after = [...lines, `- ${fact}`].join('\n') + '\n'
    return this.commit('add', before, after)
  }

  replace(match: string, text: string): MemoryChange {
    const before = this.read()
    const lines = nonEmptyLines(before)
    const idx = this.findOne(lines, match)
    lines[idx] = `- ${normalize(text)}`
    return this.commit('replace', before, lines.join('\n') + '\n')
  }

  remove(match: string): MemoryChange {
    const before = this.read()
    const lines = nonEmptyLines(before)
    const idx = this.findOne(lines, match)
    lines.splice(idx, 1)
    const after = lines.length === 0 ? '' : lines.join('\n') + '\n'
    return this.commit('remove', before, after)
  }

  private findOne(lines: string[], match: string): number {
    const needle = match.trim().toLowerCase()
    if (needle === '') throw new MemoryError('match must not be empty')
    const hits = lines
      .map((line, i) => (line.toLowerCase().includes(needle) ? i : -1))
      .filter((i) => i >= 0)
    if (hits.length === 0) throw new MemoryError(`No memory line contains "${match}"`)
    if (hits.length > 1)
      throw new MemoryError(`"${match}" matches ${hits.length} lines; be more specific`)
    return hits[0] as number
  }

  private commit(action: MemoryChange['action'], before: string, after: string): MemoryChange {
    if (after.length > this.max) {
      throw new MemoryError(
        `MEMORY.md would be ${after.length} characters; the cap is ${this.max}. Remove or merge something first.`,
      )
    }
    atomicWrite(this.path, after)
    return { action, before, after, size: after.length, max: this.max }
  }
}

function normalize(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim().replace(/^-\s*/, '')
  if (t === '') throw new MemoryError('text must not be empty')
  return t
}

function nonEmptyLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '')
}

export function dailyLogName(date: Date): string {
  return `${date.toISOString().slice(0, 10)}.md`
}

/** Appends a timestamped bullet to memory/YYYY-MM-DD.md (episodic log, never injected wholesale). */
export function appendDailyLog(workspaceDir: string, text: string, now: Date = new Date()): string {
  const dir = join(workspaceDir, 'memory')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, dailyLogName(now))
  const hhmm = now.toISOString().slice(11, 16)
  appendFileSync(file, `- ${hhmm} ${text.replace(/\s+/g, ' ').trim()}\n`)
  return file
}

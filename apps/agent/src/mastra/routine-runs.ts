import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'

export interface RoutineRun {
  id: string
  at: string
  scheduleId: string
  name?: string
  agentId: string
  status: 'ok' | 'error'
  text?: string
  error?: string
}

/** Append-only log of routine (schedule) runs, shared with the dashboard and the Telegram gateway. */
export class RoutineRunLog {
  readonly path: string

  constructor(path: string) {
    this.path = path
  }

  append(run: RoutineRun): void {
    mkdirSync(dirname(this.path), { recursive: true })
    appendFileSync(this.path, `${JSON.stringify(run)}\n`)
  }

  list(limit = 50): RoutineRun[] {
    if (!existsSync(this.path)) return []
    const rows = readFileSync(this.path, 'utf8')
      .split('\n')
      .filter((l) => l.trim() !== '')
      .map((l) => JSON.parse(l) as RoutineRun)
    return rows.slice(-limit).reverse()
  }

  /** Runs recorded after the given ISO timestamp, oldest first (for pollers). */
  since(iso: string): RoutineRun[] {
    return this.list(1000)
      .filter((r) => r.at > iso)
      .reverse()
  }
}

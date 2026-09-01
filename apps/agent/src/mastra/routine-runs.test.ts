import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { RoutineRunLog } from './routine-runs.ts'

describe('RoutineRunLog', () => {
  it('appends and lists newest first, and pages by time', () => {
    const log = new RoutineRunLog(join(mkdtempSync(join(tmpdir(), 'rr-')), 'runs.jsonl'))
    log.append({
      id: '1',
      at: '2026-09-01T08:00:00Z',
      scheduleId: 's',
      agentId: 'assistant',
      status: 'ok',
      text: 'morning brief',
    })
    log.append({
      id: '2',
      at: '2026-09-01T09:00:00Z',
      scheduleId: 's',
      agentId: 'assistant',
      status: 'error',
      error: 'boom',
    })
    expect(log.list().map((r) => r.id)).toEqual(['2', '1'])
    expect(log.since('2026-09-01T08:30:00Z').map((r) => r.id)).toEqual(['2'])
    expect(new RoutineRunLog(log.path).list(1)).toHaveLength(1)
  })
})

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { loadOrCreateThread, rotateThread } from './thread.ts'

describe('persistent CLI thread', () => {
  it('creates once, resumes on the next start, rotates on /new', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'thread-')), 'data')
    const first = loadOrCreateThread(dir)
    expect(first.resumed).toBe(false)
    const second = loadOrCreateThread(dir)
    expect(second).toEqual({ thread: first.thread, resumed: true })
    const fresh = rotateThread(dir)
    expect(fresh).not.toBe(first.thread)
    expect(loadOrCreateThread(dir)).toEqual({ thread: fresh, resumed: true })
  })
})

import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { createStorage, sqlitePath } from './storage.ts'

describe('sqlitePath', () => {
  it('creates the data directory so libsql can open the file', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'data-')), 'nested', 'data')
    const path = sqlitePath(dir)
    expect(existsSync(dir)).toBe(true)
    expect(path).toBe(join(dir, 'agent.db'))
  })
})

describe('createStorage', () => {
  it('uses a local sqlite file when DATABASE_URL is unset or blank', () => {
    const dir = mkdtempSync(join(tmpdir(), 'data-'))
    const storage = createStorage({ DATABASE_URL: '   ', AGENT_DATA_DIR: dir })
    expect(storage.constructor.name).toBe('LibSQLStore')
  })

  it('uses postgres when DATABASE_URL is set', () => {
    const storage = createStorage({ DATABASE_URL: 'postgresql://u:p@localhost:5432/db' })
    expect(storage.constructor.name).toBe('PostgresStore')
  })
})

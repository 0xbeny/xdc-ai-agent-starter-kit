import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import type { MastraStorage } from '@mastra/core/storage'
import { LibSQLStore } from '@mastra/libsql'
import { PostgresStore } from '@mastra/pg'

import { resolveFromRoot } from './paths.ts'

type Env = Readonly<Record<string, string | undefined>>

/** Ensures the directory exists (libsql will not create parents) and returns the db file path. */
export function sqlitePath(dataDir: string): string {
  mkdirSync(dataDir, { recursive: true })
  return join(dataDir, 'agent.db')
}

/** Postgres when DATABASE_URL is set (deploy/compose), otherwise a local SQLite file for zero-setup dev. */
export function createStorage(env: Env): MastraStorage {
  const databaseUrl = env.DATABASE_URL?.trim()
  if (databaseUrl) {
    return new PostgresStore({ id: 'agent-storage', connectionString: databaseUrl })
  }
  const dataDir = resolveFromRoot(env.AGENT_DATA_DIR?.trim() || './data')
  return new LibSQLStore({ id: 'agent-storage', url: `file:${sqlitePath(dataDir)}` })
}

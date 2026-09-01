import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { loadDotEnv } from '@xdc-ai/secrets'

// Imported first by tsx entrypoints (gateway) so .env is present before any config is read.
let dir = resolve(process.cwd())
for (;;) {
  if (existsSync(join(dir, 'pnpm-workspace.yaml'))) break
  const parent = dirname(dir)
  if (parent === dir) break
  dir = parent
}
loadDotEnv(join(dir, '.env'))

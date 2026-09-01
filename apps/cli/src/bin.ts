#!/usr/bin/env -S npx tsx
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { FileAuthStore } from '@xdc-ai/xdcai'

import { login, runSetup } from './wizard.ts'

function findRoot(start: string): string {
  let dir = resolve(start)
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return resolve(start)
    dir = parent
  }
}

const root = findRoot(process.cwd())
const paths = {
  root,
  envFile: join(root, '.env'),
  dataDir: resolve(root, process.env.AGENT_DATA_DIR ?? 'data'),
  workspaceDir: resolve(root, process.env.AGENT_WORKSPACE ?? 'workspace'),
}

const command = process.argv[2] ?? 'setup'
switch (command) {
  case 'setup':
    await runSetup(paths)
    break
  case 'login':
    await login(new FileAuthStore(join(paths.dataDir, 'xdcai-auth.json')))
    break
  default:
    console.error(`Unknown command "${command}". Use: setup | login`)
    process.exit(1)
}

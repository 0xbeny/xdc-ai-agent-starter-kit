#!/usr/bin/env -S npx tsx
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { loadDotEnv } from '@xdc-ai/secrets'
import { FileAuthStore } from '@xdc-ai/xdcai'

import { spawn } from 'node:child_process'

import { runChat } from './chat.ts'
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
loadDotEnv(join(root, '.env')) // tsx does not load .env; services and `mastra dev` do
const paths = {
  root,
  envFile: join(root, '.env'),
  dataDir: resolve(root, process.env.AGENT_DATA_DIR ?? 'data'),
  workspaceDir: resolve(root, process.env.AGENT_WORKSPACE ?? 'workspace'),
}

const command = process.argv[2] ?? 'chat'
const script = (name: string): Promise<number> =>
  new Promise((resolve) => {
    const child = spawn('bash', [join(root, 'scripts', name), ...process.argv.slice(3)], {
      stdio: 'inherit',
      cwd: root,
    })
    child.on('exit', (code) => resolve(code ?? 1))
  })

switch (command) {
  case 'chat':
    await runChat()
    break
  case 'setup':
    await runSetup(paths)
    break
  case 'login':
    await login(new FileAuthStore(join(paths.dataDir, 'xdcai-auth.json')))
    break
  case 'serve':
    process.exit(await script('serve.sh'))
    break
  case 'update':
    process.exit(await script('update.sh'))
    break
  case 'status':
    process.argv.push('/status')
    await runChat()
    break
  case 'help':
  case '--help':
  case '-h':
    console.log(`xdc-agent — your agent from the terminal

  xdc-agent            chat with the agent (default)
  xdc-agent setup      configure model, wallet, caps, connectors
  xdc-agent login      link the XDC AI wallet again
  xdc-agent serve      run agent + dashboard (+ Telegram) in the foreground
  xdc-agent update     update the kit from the original repo (your data is untouched)
  xdc-agent help`)
    break
  default:
    console.error(`Unknown command "${command}". Try: xdc-agent help`)
    process.exit(1)
}

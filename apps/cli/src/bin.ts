#!/usr/bin/env -S npx tsx
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { loadDotEnv } from '@xdc-ai/secrets'
import { FileAuthStore } from '@xdc-ai/xdcai'

import { spawn } from 'node:child_process'

import { runChat } from './chat.ts'
import { runDashboardCommand } from './dashboard.ts'
import { connectTelegram } from './telegram.ts'
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

async function ensureConfigured(): Promise<void> {
  if (process.env.MODEL_CHAT?.trim()) return
  console.log('No model configured yet (MODEL_CHAT missing in .env) — starting setup first.\n')
  await runSetup(paths)
  loadDotEnv(paths.envFile, process.env)
  if (!process.env.MODEL_CHAT?.trim()) {
    console.error('Setup did not save a model. Run `xdc-agent setup` again when ready.')
    process.exit(1)
  }
}

switch (command) {
  case 'chat':
    await ensureConfigured()
    await runChat()
    break
  case 'setup':
    await runSetup(paths)
    break
  case 'login':
    await login(new FileAuthStore(join(paths.dataDir, 'xdcai-auth.json')))
    break
  case 'dashboard':
  case 'ui':
    await ensureConfigured()
    try {
      await runDashboardCommand(root, process.argv.slice(3))
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
    break
  case '--version':
  case '-v':
  case 'version': {
    const { execSync } = await import('node:child_process')
    let head = 'unknown'
    try {
      head = execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8' }).trim()
    } catch {
      /* not a git checkout */
    }
    console.log(`xdc-agent 0.1.0-dev (${head})`)
    break
  }
  case 'doctor':
    process.exit(await (await import('./doctor.ts')).runDoctor(root))
  // eslint-disable-next-line no-fallthrough -- process.exit never returns
  case 'telegram':
    await ensureConfigured()
    await connectTelegram(paths)
    break
  case 'serve':
    process.exit(await script('serve.sh'))
    break
  case 'update':
    process.exit(await script('update.sh'))
    break
  case 'status':
    await ensureConfigured()
    await (await import('./chat.ts')).printStatus()
    break
  case 'help':
  case '--help':
  case '-h':
    console.log(`xdc-agent — your agent from the terminal

  xdc-agent            chat with the agent (default) — type / for commands
  xdc-agent dashboard  start the UI if needed and open it; flags: --status --logs --foreground --restart --stop --port <n> --no-open
  xdc-agent telegram   connect a Telegram bot and get the pairing code
  xdc-agent setup      configure model, wallet, caps, connectors
  xdc-agent login      link the XDC AI wallet again
  xdc-agent status     one-screen summary
  xdc-agent doctor     diagnose this install: toolchain, config, services, tools, egress
  xdc-agent serve      run agent + dashboard (+ Telegram) in the foreground
  xdc-agent update     update the kit from the original repo (your data is untouched)
  xdc-agent help`)
    break
  default:
    console.error(`Unknown command "${command}". Try: xdc-agent help`)
    process.exit(1)
}

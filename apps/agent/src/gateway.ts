/**
 * Telegram gateway: `pnpm gateway`. Runs beside the agent server and shares its data dir,
 * so approvals decided here are the same approvals the dashboard shows.
 */
import './env.ts'

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { AccessControl, createTelegramBot, parseIdList } from '@xdc-ai/gateway'

import { mastra } from './mastra/index.ts'
import { getKit } from './mastra/kit.ts'

const kit = getKit()
const env = kit.config.env
const token = env.TELEGRAM_BOT_TOKEN?.trim()
if (!token) {
  console.error(
    'TELEGRAM_BOT_TOKEN is not set. Create a bot with @BotFather, put the token in .env, then run `pnpm gateway` again.',
  )
  process.exit(1)
}

const acl = new AccessControl({
  path: join(kit.config.dataDir, 'telegram-allowlist.json'),
  adminIds: parseIdList(env.TELEGRAM_ADMIN_IDS),
  userIds: parseIdList(env.TELEGRAM_USER_IDS),
})

const agent = mastra.getAgent('assistant')

// Telegram long-polls deliver each update to exactly ONE consumer: a second gateway (e.g. a manual
// serve.sh next to the launchd service) steals messages randomly and makes pairing look broken.
const lockFile = join(kit.config.dataDir, 'gateway.pid')
if (existsSync(lockFile)) {
  const pid = Number(readFileSync(lockFile, 'utf8').trim())
  let alive = false
  try {
    if (pid > 0) {
      process.kill(pid, 0)
      alive = true
    }
  } catch {
    /* stale lock */
  }
  if (alive && pid !== process.pid) {
    console.error(
      `Another telegram gateway is already running (pid ${pid}) — not starting a second one. ` +
        'Stop it first: xdc-agent dashboard --stop',
    )
    process.exit(1)
  }
}
writeFileSync(lockFile, `${process.pid}\n`)
const dropLock = (): void => {
  try {
    rmSync(lockFile, { force: true })
  } catch {
    /* best effort */
  }
}
process.on('exit', dropLock)

const pairingFile = join(kit.config.dataDir, 'telegram-pairing')

const gateway = createTelegramBot({
  token,
  acl,
  onPairingCode(code) {
    try {
      if (code) writeFileSync(pairingFile, `${code}\n`, { mode: 0o600 })
      else rmSync(pairingFile, { force: true })
    } catch {
      /* the log still carries the code */
    }
  },
  approvals: kit.approvals,
  routineRuns: kit.routineRuns,
  agent: {
    async reply(text, ctx) {
      const result = await agent.generate(text, {
        memory: { thread: ctx.threadId, resource: ctx.resourceId },
      })
      return (result as { text?: string }).text ?? ''
    },
  },
})

process.on('SIGINT', () => void gateway.stop().then(() => process.exit(0)))
process.on('SIGTERM', () => void gateway.stop().then(() => process.exit(0)))
await gateway.start()

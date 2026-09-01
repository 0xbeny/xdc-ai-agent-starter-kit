/**
 * Telegram gateway: `pnpm gateway`. Runs beside the agent server and shares its data dir,
 * so approvals decided here are the same approvals the dashboard shows.
 */
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

const gateway = createTelegramBot({
  token,
  acl,
  approvals: kit.approvals,
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

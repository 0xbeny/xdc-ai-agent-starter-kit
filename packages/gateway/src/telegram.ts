import { type Approval, type ApprovalStore } from '@xdc-ai/xdcai'
import { Bot, InlineKeyboard } from 'grammy'

import type { AccessControl } from './access.ts'
import { approvalMessage, chunk, esc } from './format.ts'

export interface AgentLike {
  /** Runs one turn; the gateway keeps one memory thread per chat. */
  reply(
    text: string,
    ctx: { threadId: string; resourceId: string; userName?: string },
  ): Promise<string>
}

export interface RoutineRunLike {
  id: string
  at: string
  name?: string
  status: 'ok' | 'error'
  text?: string
  error?: string
}

export interface TelegramGatewayOptions {
  token: string
  acl: AccessControl
  agent: AgentLike
  approvals: ApprovalStore
  /** Optional source of routine (cron) results to push to admins, e.g. the agent's routine-runs.jsonl. */
  routineRuns?: { since(iso: string): RoutineRunLike[] }
  log?: (line: string) => void
  /** How often to look for new approvals to push to admins (ms). */
  pollMs?: number
}

export function createTelegramBot(options: TelegramGatewayOptions): {
  bot: Bot
  start: () => Promise<void>
  stop: () => Promise<void>
} {
  const { acl, agent, approvals } = options
  const log = options.log ?? ((line: string) => console.info(`[telegram] ${line}`))
  const bot = new Bot(options.token)
  const seen = new Set<string>()
  let timer: NodeJS.Timeout | undefined

  const keyboard = (a: Approval): InlineKeyboard =>
    new InlineKeyboard()
      .text('✅ Approve', `apr:${a.id}:approved`)
      .text('⛔ Deny', `apr:${a.id}:denied`)

  bot.command('start', async (ctx) => {
    const id = String(ctx.from?.id ?? '')
    if (acl.isAllowed(id))
      return ctx.reply('Connected. Send me a task, or /approvals to see what is waiting.')
    return ctx.reply(
      `This agent is private. Ask its owner for a pairing code and send: /pair CODE\nYour Telegram id: ${id}`,
    )
  })

  bot.command('pair', async (ctx) => {
    const id = String(ctx.from?.id ?? '')
    const code = ctx.match?.toString().trim() ?? ''
    const role = acl.pair(id, code, ctx.from?.first_name)
    if (!role)
      return ctx.reply('That code is not valid (codes expire after 10 minutes and are single-use).')
    log(`paired ${id} as ${role}`)
    return ctx.reply(
      role === 'admin'
        ? 'Paired as admin. You will be asked to approve payments and sends here.'
        : 'Paired. Send me a task.',
    )
  })

  bot.use(async (ctx, next) => {
    const id = String(ctx.from?.id ?? '')
    if (!acl.isAllowed(id)) return ctx.reply('Not authorised. Send /start for instructions.')
    return next()
  })

  bot.command('approvals', async (ctx) => {
    if (!acl.isAdmin(String(ctx.from?.id))) return ctx.reply('Only admins can review approvals.')
    const pending = await approvals.list('pending')
    if (pending.length === 0) return ctx.reply('Nothing pending.')
    for (const a of pending.slice(0, 10))
      await ctx.reply(approvalMessage(a), { parse_mode: 'MarkdownV2', reply_markup: keyboard(a) })
  })

  bot.command('whoami', async (ctx) =>
    ctx.reply(`id ${ctx.from?.id} · role ${acl.roleOf(String(ctx.from?.id))}`),
  )

  bot.callbackQuery(/^apr:([^:]+):(approved|denied)$/, async (ctx) => {
    if (!acl.isAdmin(String(ctx.from.id))) return ctx.answerCallbackQuery({ text: 'Admins only' })
    const id = ctx.match[1] as string
    const decision = ctx.match[2] as 'approved' | 'denied'
    try {
      const a = await approvals.decide(
        id as string,
        decision as 'approved' | 'denied',
        `via telegram ${ctx.from.id}`,
      )
      await ctx.answerCallbackQuery({ text: decision === 'approved' ? 'Approved' : 'Denied' })
      await ctx.editMessageReplyMarkup()
      await ctx.reply(
        `${decision === 'approved' ? '✅' : '⛔'} ${esc(a.tool)} ${esc(decision)} — the agent will continue on its next turn\\.`,
        { parse_mode: 'MarkdownV2' },
      )
    } catch (error) {
      await ctx.answerCallbackQuery({ text: error instanceof Error ? error.message : 'failed' })
    }
  })

  bot.on('message:text', async (ctx) => {
    const chatId = String(ctx.chat.id)
    const userId = String(ctx.from.id)
    await ctx.replyWithChatAction('typing')
    try {
      const answer = await agent.reply(ctx.message.text, {
        threadId: `telegram:${chatId}`,
        resourceId: `telegram:${userId}`,
        ...(ctx.from.first_name ? { userName: ctx.from.first_name } : {}),
      })
      for (const part of chunk(answer || '(no reply)')) await ctx.reply(part)
    } catch (error) {
      await ctx.reply(
        `Something went wrong: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  })

  bot.catch((err) => log(`error: ${err.message}`))

  let lastRunAt = new Date().toISOString()
  async function pushRoutineRuns(): Promise<void> {
    if (!options.routineRuns) return
    for (const run of options.routineRuns.since(lastRunAt)) {
      lastRunAt = run.at
      const head =
        run.status === 'ok'
          ? `⏰ Routine${run.name ? ` ${run.name}` : ''} finished`
          : `⚠️ Routine${run.name ? ` ${run.name}` : ''} failed`
      const body =
        run.status === 'ok' ? (run.text ?? '(no output)') : (run.error ?? 'unknown error')
      for (const adminId of acl.adminIds()) {
        for (const part of chunk(`${head}\n\n${body}`)) {
          try {
            await bot.api.sendMessage(adminId, part)
          } catch (error) {
            log(
              `could not deliver routine result to ${adminId}: ${error instanceof Error ? error.message : String(error)}`,
            )
          }
        }
      }
    }
  }

  async function pushNewApprovals(): Promise<void> {
    const pending = await approvals.list('pending')
    for (const a of pending) {
      if (seen.has(a.id)) continue
      seen.add(a.id)
      for (const adminId of acl.adminIds()) {
        try {
          await bot.api.sendMessage(adminId, approvalMessage(a), {
            parse_mode: 'MarkdownV2',
            reply_markup: keyboard(a),
          })
        } catch (error) {
          log(
            `could not notify ${adminId}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }
    }
  }

  return {
    bot,
    async start() {
      for (const a of await approvals.list('pending')) seen.add(a.id) // don't replay history on boot
      timer = setInterval(
        () => void Promise.all([pushNewApprovals(), pushRoutineRuns()]),
        options.pollMs ?? 5000,
      )
      log(`pairing code: ${acl.pairingCode()} (send /pair CODE to the bot)`)
      await bot.start({ onStart: (me) => log(`@${me.username} listening`) })
    },
    async stop() {
      if (timer) clearInterval(timer)
      await bot.stop()
    },
  }
}

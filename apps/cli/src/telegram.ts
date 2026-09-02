import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import * as p from '@clack/prompts'
import pc from 'picocolors'

import { mergeEnv, parseEnv } from './env-file.ts'
import { ensureServiceRunning, launchdLoaded, readLogTail, say } from './service.ts'

export async function validateBotToken(
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: boolean; username?: string; error?: string }> {
  try {
    const res = await fetchFn(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(10_000),
    })
    const body = (await res.json()) as {
      ok?: boolean
      result?: { username?: string }
      description?: string
    }
    if (!body.ok) return { ok: false, error: body.description ?? `HTTP ${res.status}` }
    return { ok: true, ...(body.result?.username ? { username: body.result.username } : {}) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** The gateway keeps a live code in data/telegram-pairing until someone pairs. */
export function readPairingFile(root: string): string | undefined {
  const file = join(root, 'data', 'telegram-pairing')
  if (!existsSync(file)) return undefined
  const code = readFileSync(file, 'utf8').trim()
  return /^\d{6}$/.test(code) ? code : undefined
}

export function findPairingCode(log: string): string | undefined {
  const m = [...log.matchAll(/pairing code: (\d{6})/g)].at(-1)
  return m?.[1]
}

/**
 * `xdc-agent telegram` / `/telegram` in chat: show where pairing stands — the live code and bot
 * link, or "already paired", or how to start the gateway. Returns false when no token is saved yet
 * (caller falls back to the interactive connect flow).
 */
export async function showPairingStatus(paths: {
  root: string
  envFile: string
}): Promise<boolean> {
  const env = existsSync(paths.envFile) ? parseEnv(readFileSync(paths.envFile, 'utf8')) : {}
  const token = env.TELEGRAM_BOT_TOKEN?.trim()
  if (!token) return false
  const check = await validateBotToken(token)
  const bot = check.ok && check.username ? `@${check.username}` : 'your bot'
  const link = check.ok && check.username ? `https://t.me/${check.username}` : ''
  const allowlist = join(paths.root, 'data', 'telegram-allowlist.json')
  let paired = 0
  if (existsSync(allowlist)) {
    try {
      paired = Object.keys(
        (JSON.parse(readFileSync(allowlist, 'utf8')) as { users?: Record<string, unknown> })
          .users ?? {},
      ).length
    } catch {
      /* unreadable */
    }
  }
  if (paired > 0) {
    say(`${pc.green('✓')} Telegram is connected: ${pc.bold(bot)} · ${paired} user(s) paired`)
    say(`  Just message it${link ? `: ${pc.cyan(link)}` : ''} — approvals arrive as buttons there.`)
    return true
  }
  const code = readPairingFile(paths.root)
  if (code) {
    say(`${pc.green('✓')} ${pc.bold(bot)} is waiting for you. Two steps:`)
    say(`  1. Open ${pc.cyan(link || 'your bot in Telegram')}`)
    say(`  2. Send it:  ${pc.bold(pc.yellow(`/pair ${code}`))}`)
    say(
      pc.dim(
        '  Codes rotate every few minutes — run `xdc-agent telegram` again if it says invalid.',
      ),
    )
    return true
  }
  say(
    `${pc.yellow('⚠')} Bot token is saved (${pc.bold(bot)}) but the gateway has not issued a code.`,
  )
  say(`  Start the service:  ${pc.cyan('xdc-agent dashboard --restart')}  then run this again.`)
  say(pc.dim(`  Still nothing? tail -20 ${join(paths.root, 'data', 'service.err.log')}`))
  return true
}

/** `xdc-agent telegram --reset`: save the bot token, (re)start the gateway, print the pairing code. */
export async function connectTelegram(paths: { root: string; envFile: string }): Promise<void> {
  p.intro(pc.bgCyan(pc.black(' xdc-agent · telegram ')))
  const existingText = existsSync(paths.envFile) ? readFileSync(paths.envFile, 'utf8') : ''
  const current = parseEnv(existingText)
  p.note(
    [
      '1. Open @BotFather in Telegram → /newbot → follow the prompts',
      '2. Copy the token it gives you (looks like 123456:ABC-…)',
      '3. Paste it below',
    ].join('\n'),
    'Create a bot',
  )
  const token = await p.password({
    message: current.TELEGRAM_BOT_TOKEN ? 'Bot token (blank = keep the saved one)' : 'Bot token',
    validate: (v) => (current.TELEGRAM_BOT_TOKEN || v?.trim() ? undefined : 'Token required'),
  })
  if (p.isCancel(token)) return p.cancel('Cancelled')
  const value = (token as string).trim() || current.TELEGRAM_BOT_TOKEN || ''
  const s = p.spinner()
  s.start('Checking the token with Telegram…')
  const check = await validateBotToken(value)
  if (!check.ok) {
    s.stop(pc.red(`Telegram rejected it: ${check.error}`))
    return p.outro('Nothing saved. Get a fresh token from @BotFather and try again.')
  }
  s.stop(`Bot ${pc.bold(`@${check.username ?? 'unknown'}`)} is valid`)
  writeFileSync(paths.envFile, mergeEnv(existingText, { TELEGRAM_BOT_TOKEN: value }))
  say('Token saved to .env')

  const before = readLogTail(paths.root, 400)
  if (launchdLoaded()) {
    ensureServiceRunning(paths.root, true)
    s.start('Restarting the service so the gateway starts (a rebuild can take a minute)…')
    let code: string | undefined
    for (let i = 0; i < 90 && !code; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      code = readPairingFile(paths.root)
      if (!code) {
        const now = readLogTail(paths.root, 400)
        if (now !== before)
          code = findPairingCode(
            now.slice(before.length > 0 ? Math.max(0, now.lastIndexOf(before.slice(-200))) : 0),
          )
      }
    }
    s.stop(code ? 'Gateway is up' : 'Service restarted (no pairing code yet — see below)')
    finish(check.username, code, paths.root)
    return
  }
  s.stop('No login service — running the gateway in the foreground (Ctrl+C stops it)')
  finish(check.username, undefined, paths.root)
  const child = spawn('pnpm', ['--filter', '@xdc-ai/agent', 'gateway'], {
    cwd: paths.root,
    stdio: 'inherit',
  })
  await new Promise<void>((resolve) => child.on('exit', () => resolve()))
}

function finish(username: string | undefined, code: string | undefined, root: string): void {
  const lines = [
    `Open ${pc.bold(`https://t.me/${username ?? 'your_bot'}`)} and send ${pc.cyan(code ? `/pair ${code}` : '/pair <code>')}`,
    code
      ? 'The first person to pair becomes admin and receives approval requests.'
      : `The 6-digit code is printed by the gateway: ${pc.dim(`grep "pairing code" ${join(root, 'data', 'service.out.log')}`)}`,
    'Then just message the bot. Admins: /approvals lists what is waiting.',
  ]
  p.note(lines.join('\n'), 'Pair your Telegram')
  p.outro('Done.')
}

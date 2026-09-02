import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import pc from 'picocolors'

import { parseEnv } from './env-file.ts'
import { readPairingFile } from './telegram.ts'
import {
  isLoopbackHost,
  lastDistinctError,
  launchdLoaded,
  launchdState,
  waitForHttp,
} from './service.ts'

export interface Check {
  name: string
  status: 'ok' | 'warn' | 'fail'
  detail: string
  fix?: string
}

/** Pure .env analysis (names only — never echo values). */
export function envChecks(env: Record<string, string>): Check[] {
  const out: Check[] = []
  out.push(
    env.MODEL_CHAT
      ? { name: 'chat model', status: 'ok', detail: `MODEL_CHAT set (${env.MODEL_CHAT})` }
      : {
          name: 'chat model',
          status: 'fail',
          detail: 'MODEL_CHAT missing',
          fix: 'xdc-agent setup',
        },
  )
  out.push(
    env.KIT_API_TOKEN
      ? { name: 'api token', status: 'ok', detail: 'KIT_API_TOKEN set' }
      : {
          name: 'api token',
          status: 'warn',
          detail: 'KIT_API_TOKEN missing — kit API is unauthenticated',
          fix: 'xdc-agent setup',
        },
  )
  const wide = env.DASHBOARD_HOST !== undefined && !isLoopbackHost(env.DASHBOARD_HOST)
  if (wide && !env.DASHBOARD_PASSWORD)
    out.push({
      name: 'dashboard',
      status: 'fail',
      detail: `DASHBOARD_HOST=${env.DASHBOARD_HOST} without DASHBOARD_PASSWORD — every request is refused`,
      fix: 'set DASHBOARD_PASSWORD via xdc-agent setup, or bind 127.0.0.1',
    })
  else
    out.push({
      name: 'dashboard',
      status: 'ok',
      detail: wide ? 'non-local bind with a password' : 'local-only bind (no password needed)',
    })
  const sandboxOff = ['off', 'none', '0', 'false'].includes(
    (env.SANDBOX ?? '').trim().toLowerCase(),
  )
  out.push(
    sandboxOff
      ? {
          name: 'sandbox',
          status: 'warn',
          detail: 'SANDBOX is off — run_command and folder grants are disabled',
          fix: 'remove SANDBOX from .env or set SANDBOX=local',
        }
      : {
          name: 'sandbox',
          status: 'ok',
          detail: 'on (run_command, folder grants, fetch_url into sandbox)',
        },
  )
  out.push(
    env.TELEGRAM_BOT_TOKEN
      ? {
          name: 'telegram',
          status: 'ok',
          detail: 'bot token set — gateway starts with the service',
        }
      : {
          name: 'telegram',
          status: 'ok',
          detail: 'not connected (optional) — xdc-agent telegram to chat from Telegram',
        },
  )
  return out
}

/** Gateway ground truth: paired users, a live pairing code, or evidence it never started. */
export function gatewayCheck(root: string, env: Record<string, string>): Check | undefined {
  if (!env.TELEGRAM_BOT_TOKEN) return undefined
  const allowlist = join(root, 'data', 'telegram-allowlist.json')
  if (existsSync(allowlist)) {
    try {
      const parsed = JSON.parse(readFileSync(allowlist, 'utf8')) as {
        users?: Record<string, unknown>
      }
      const users = Object.keys(parsed.users ?? {}).length
      if (users > 0)
        return { name: 'telegram gateway', status: 'ok', detail: `${users} user(s) paired` }
    } catch {
      /* unreadable — fall through */
    }
  }
  const code = readPairingFile(root)
  if (code)
    return {
      name: 'telegram gateway',
      status: 'ok',
      detail: `waiting for pairing — send /pair ${code} to your bot`,
    }
  return {
    name: 'telegram gateway',
    status: 'warn',
    detail: 'token set but no pairing code and nobody paired — the gateway may not be running',
    fix: 'xdc-agent dashboard --restart · then: tail -40 data/service.err.log',
  }
}

async function run(
  cmd: string,
  args: string[],
  cwd: string,
): Promise<{ code: number | null; out: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, args, { cwd })
    let out = ''
    child.stdout.on('data', (d: Buffer) => (out += d.toString()))
    child.stderr.on('data', (d: Buffer) => (out += d.toString()))
    child.on('error', (e) => resolvePromise({ code: null, out: String(e) }))
    child.on('exit', (code) => resolvePromise({ code, out }))
  })
}

const icon = { ok: pc.green('✓'), warn: pc.yellow('⚠'), fail: pc.red('✗') } as const

/** `xdc-agent doctor` / `/doctor`: one screen of truth about this install. Returns the exit code. */
export async function runDoctor(root: string): Promise<number> {
  const checks: Check[] = []

  // Run with launchd's minimal PATH, not this shell's — the service must survive without your rc files.
  const tc = await new Promise<{ code: number | null; out: string }>((resolvePromise) => {
    const child = spawn('bash', [join(root, 'scripts', 'serve.sh'), '--check'], {
      cwd: root,
      env: { HOME: process.env.HOME ?? '', PATH: '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin' },
    })
    let out = ''
    child.stdout.on('data', (d: Buffer) => (out += d.toString()))
    child.stderr.on('data', (d: Buffer) => (out += d.toString()))
    child.on('error', (e) => resolvePromise({ code: null, out: String(e) }))
    child.on('exit', (code) => resolvePromise({ code, out }))
  })
  checks.push(
    tc.code === 0
      ? { name: 'toolchain', status: 'ok', detail: tc.out.trim().split('\n').join(' · ') }
      : {
          name: 'toolchain',
          status: 'fail',
          detail: `under launchd's PATH: ${tc.out.trim().split('\n')[0] ?? 'serve.sh --check failed'}`,
          fix: 'xdc-agent update (records the toolchain for launchd), then xdc-agent dashboard --restart',
        },
  )

  const head = await run('git', ['rev-parse', '--short', 'HEAD'], root)
  const dirty = await run('git', ['status', '--porcelain', '-uno'], root)
  const dirtyCount = dirty.out.split('\n').filter(Boolean).length
  checks.push({
    name: 'version',
    status: dirtyCount > 0 ? 'warn' : 'ok',
    detail: `${head.out.trim() || 'unknown'}${dirtyCount ? ` · ${dirtyCount} locally modified file(s)` : ''}`,
    ...(dirtyCount ? { fix: 'xdc-agent update refuses on dirty files — revert local edits' } : {}),
  })

  const envFile = join(root, '.env')
  if (!existsSync(envFile))
    checks.push({ name: 'config', status: 'fail', detail: '.env missing', fix: 'xdc-agent setup' })
  else {
    const parsed = parseEnv(readFileSync(envFile, 'utf8'))
    checks.push(...envChecks(parsed))
    const gw = gatewayCheck(root, parsed)
    if (gw) checks.push(gw)
  }

  checks.push(
    existsSync(join(root, 'workspace', 'SOUL.md'))
      ? { name: 'workspace', status: 'ok', detail: 'workspace/ seeded (SOUL.md present)' }
      : {
          name: 'workspace',
          status: 'warn',
          detail: 'workspace/SOUL.md missing',
          fix: 'restart the agent once to seed it',
        },
  )

  const agentUp = await waitForHttp('http://127.0.0.1:4111/api', 2500)
  const env = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {}
  if (agentUp) {
    let extra = ''
    try {
      const res = await fetch('http://127.0.0.1:4111/kit/status', {
        headers: env.KIT_API_TOKEN ? { 'x-kit-token': env.KIT_API_TOKEN } : {},
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        const body = (await res.json()) as { wallet?: { connected?: boolean }; pending?: number }
        extra = ` · wallet ${body.wallet?.connected ? 'connected' : 'not connected'} · ${body.pending ?? 0} approvals pending`
      } else extra = ` · /kit/status HTTP ${res.status}`
    } catch {
      /* status endpoint shape may vary */
    }
    checks.push({ name: 'agent api', status: 'ok', detail: `answering on :4111${extra}` })
    try {
      const res = await fetch('http://127.0.0.1:4111/kit/tools', {
        headers: env.KIT_API_TOKEN ? { 'x-kit-token': env.KIT_API_TOKEN } : {},
        signal: AbortSignal.timeout(5000),
      })
      const body = (await res.json()) as { disabled?: string[] }
      const off = body.disabled ?? []
      checks.push({
        name: 'tools',
        status: 'ok',
        detail: off.length ? `switched off: ${off.join(', ')}` : 'all tools enabled',
      })
    } catch {
      /* older server without /kit/tools */
    }
  } else {
    checks.push({
      name: 'agent api',
      status: 'fail',
      detail: 'nothing on :4111',
      fix: 'xdc-agent dashboard (starts the service) · logs: xdc-agent dashboard --logs',
    })
  }
  checks.push(
    (await waitForHttp('http://127.0.0.1:3000/login', 2500))
      ? { name: 'dashboard ui', status: 'ok', detail: 'answering on :3000' }
      : {
          name: 'dashboard ui',
          status: 'warn',
          detail: 'nothing on :3000',
          fix: 'xdc-agent dashboard',
        },
  )
  if (launchdLoaded()) {
    const st = launchdState()
    if (st?.running) {
      checks.push({
        name: 'login service',
        status: 'ok',
        detail: `running (pid ${st.pid})${st.runs && st.runs > 10 ? ` · restarted ${st.runs} times before` : ''}`,
      })
    } else {
      const err = lastDistinctError(root)
      const looping = (st?.runs ?? 0) > 10
      checks.push({
        name: 'login service',
        status: 'fail',
        detail: `${looping ? `CRASH-LOOPING (${st?.runs} restarts)` : `loaded, not running (last exit ${st?.lastExit ?? '?'})`}${err ? ` · last error: ${err.slice(0, 160)}` : ''}`,
        fix: 'xdc-agent update (heals the recorded toolchain) · xdc-agent dashboard --restart · tail -40 data/service.err.log',
      })
    }
  }

  try {
    const res = await fetch('https://api.telegram.org', { signal: AbortSignal.timeout(6000) })
    checks.push({ name: 'internet', status: 'ok', detail: `egress works (HTTP ${res.status})` })
  } catch (e) {
    checks.push({
      name: 'internet',
      status: 'warn',
      detail: `no egress from this process: ${e instanceof Error ? e.message : String(e)}`,
    })
  }

  const w = Math.max(...checks.map((c) => c.name.length))
  for (const c of checks) console.log(`  ${icon[c.status]} ${c.name.padEnd(w + 2)}${c.detail}`)
  const fixes = checks.filter((c) => c.fix)
  if (fixes.length) {
    console.log(pc.bold('\n  fixes:'))
    for (const c of fixes) console.log(`  → ${c.name}: ${c.fix}`)
  }
  const fails = checks.filter((c) => c.status === 'fail').length
  console.log(pc.dim(`\n  ${checks.length} checks · ${fails} failing`))
  return fails > 0 ? 1 : 0
}

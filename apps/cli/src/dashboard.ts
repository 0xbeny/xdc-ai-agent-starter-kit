import { execSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import pc from 'picocolors'

import { mergeEnv, parseEnv } from './env-file.ts'
import { tailnetHttpUrl, tailnetSelf, tailscaleServe, tailscaleServing } from './tailnet.ts'
import {
  ensureServiceRunning,
  lastDistinctError,
  isLoopbackHost,
  lanUrl,
  isSsh,
  launchdLoaded,
  launchdState,
  openBrowser,
  readErrTail,
  readLogTail,
  restartLaunchd,
  say,
  tunnelHint,
  waitForHttp,
} from './service.ts'

/** `xdc-agent dashboard`: make sure the UI is being served, then show how to reach it (and open it when local). */
export interface OpenOptions {
  background?: boolean
}

export async function openDashboard(
  root: string,
  portOverride?: number,
  opts: OpenOptions = {},
): Promise<void> {
  const port = portOverride ?? Number(process.env.DASHBOARD_PORT ?? 3000)
  const url = `http://localhost:${port}`
  let up = await waitForHttp(`${url}/login`, 2500)
  if (!up && opts.background) {
    const how = ensureServiceRunning(root)
    say(
      how === 'launchd'
        ? 'Starting the login service in the background…'
        : 'Starting agent + dashboard in the background (first start builds them — about a minute)…',
    )
    say(
      `It will be at ${pc.bold(url)}${isSsh() ? ` — from your laptop: ${pc.cyan(tunnelHint(port))}` : ''}`,
    )
    say(
      `Keep chatting; I will print a line when it is ready. Check any time:  /dashboard --status   ·   /dashboard --logs`,
    )
    void (async () => {
      const ok = await waitForHttp(`${url}/login`, 240_000)
      if (ok)
        console.log(
          `\n${pc.green('✓')} dashboard is up: ${pc.bold(url)}${isSsh() ? pc.dim(`  (${tunnelHint(port)})`) : ''}`,
        )
      else
        console.log(
          `\n${pc.red('✗')} dashboard did not come up — /dashboard --logs or /dashboard --foreground to see why\n${pc.dim(readErrTail(root, 8))}`,
        )
    })()
    return
  }
  if (!up) {
    const how = ensureServiceRunning(root)
    say(
      how === 'launchd'
        ? 'Starting the login service…'
        : 'Starting agent + dashboard in the background (first start builds them — about a minute)…',
    )
    let lastDot = 0
    let lastPeek = 0
    let lastErr = ''
    let gaveUp = false
    up = await waitForHttp(`${url}/login`, 240_000, (ms) => {
      if (gaveUp) return false
      if (ms - lastDot > 10_000) {
        lastDot = ms
        process.stdout.write(pc.dim('.'))
      }
      if (ms - lastPeek > 30_000) {
        lastPeek = ms
        // Surface what the service is doing instead of silent dots: build progress or the crash reason.
        const err = readErrTail(root, 6)
        if (err && err !== lastErr) {
          lastErr = err
          process.stdout.write(`\n${pc.dim(err)}\n`)
        }
        const st = how === 'launchd' ? launchdState() : undefined
        if (st && !st.running && st.lastExit !== undefined && st.lastExit !== 0) {
          gaveUp = true
          return false
        }
      }
      return true
    })
    process.stdout.write('\n')
    if (gaveUp && !up) {
      const st = launchdState()
      throw new Error(
        `The login service keeps exiting (last exit code ${st?.lastExit}). Run it in the foreground to see why:  xdc-agent dashboard --foreground\nRecent errors:\n${readErrTail(root, 20) || readLogTail(root, 20)}`,
      )
    }
  }
  if (!up) {
    throw new Error(
      `Dashboard did not come up on ${url}. Try:  xdc-agent dashboard --logs   or   xdc-agent dashboard --foreground\nRecent log:\n${readErrTail(root, 15) || readLogTail(root, 25)}`,
    )
  }
  const remote = !isLoopbackHost(process.env.DASHBOARD_HOST)
  const ts = tailnetSelf()
  const tsUrl = ts ? tailnetHttpUrl(ts, port) : undefined
  say(
    `Dashboard: ${pc.bold(url)}${remote ? ` · from other machines: ${pc.bold(lanUrl(port))}` : ''}${remote && tsUrl ? ` · tailnet: ${pc.bold(tsUrl)}` : ''}`,
  )
  if (ts && tailscaleServing() && ts.dnsName)
    say(`Tailscale serve is on: ${pc.bold(`https://${ts.dnsName}`)}`)
  else if (ts && !remote)
    say(
      pc.dim(
        `Tailscale detected — \`xdc-agent dashboard --tailnet\` shares it over your tailnet (HTTPS, keeps the local-only bind)`,
      ),
    )
  if (process.env.DASHBOARD_PASSWORD) say('Password: the DASHBOARD_PASSWORD you set in setup')
  else
    say(
      pc.yellow(
        'No dashboard password set — keep it on localhost, or run `xdc-agent setup` to set one',
      ),
    )
  if (isSsh()) {
    say(`You are on SSH. From your laptop run:  ${pc.cyan(tunnelHint(port))}  then open ${url}`)
  } else {
    openBrowser(url)
  }
  say(`Logs: ${root}/data/service.out.log`)
}

export interface DashboardArgs {
  action: 'open' | 'status' | 'logs' | 'foreground' | 'restart' | 'stop' | 'help'
  port?: number
  host?: string
  noOpen: boolean
  tailnet: boolean
  error?: string
}

/** `xdc-agent dashboard [--status|--logs|--foreground|--restart|--stop] [--port N] [--host A] [--tailnet] [--no-open]` */
export function parseDashboardArgs(argv: string[]): DashboardArgs {
  const out: DashboardArgs = { action: 'open', noOpen: false, tailnet: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string
    switch (a) {
      case '--status':
      case '-s':
        out.action = 'status'
        break
      case '--logs':
      case '-l':
        out.action = 'logs'
        break
      case '--foreground':
      case '-f':
        out.action = 'foreground'
        break
      case '--restart':
        out.action = 'restart'
        break
      case '--stop':
        out.action = 'stop'
        break
      case '--help':
      case '-h':
        out.action = 'help'
        break
      case '--no-open':
        out.noOpen = true
        break
      case '--tailnet':
        out.tailnet = true
        break
      case '--host': {
        const h = argv[++i]
        if (!h) return { ...out, action: 'help', error: '--host needs an address (e.g. 0.0.0.0)' }
        out.host = h
        break
      }
      case '--port':
      case '-p': {
        const v = Number(argv[++i])
        if (!Number.isInteger(v) || v <= 0)
          return { ...out, action: 'help', error: '--port needs a number' }
        out.port = v
        break
      }
      default:
        return { ...out, action: 'help', error: `unknown flag ${a}` }
    }
  }
  return out
}

export const DASHBOARD_HELP = `xdc-agent dashboard [flags]
  (none)         start the service if needed and open the UI (prints the ssh -L command over SSH)
  --status, -s   is it running? which port answers, launchd state, last exit code
  --logs, -l     follow data/service.out.log and service.err.log
  --foreground   run scripts/serve.sh in this terminal to watch it start (Ctrl+C stops it)
  --restart      restart the service (launchd) or start a fresh background instance
  --stop         stop the service / background instance
  --host <a>     bind address, saved to .env: 127.0.0.1 local-only (default) · 0.0.0.0 LAN/tailnet
                 (a DASHBOARD_PASSWORD is generated and saved when going non-local without one)
  --tailnet      share over Tailscale with \`tailscale serve\` — HTTPS, tailnet-only, keeps the local bind
  --port <n>     dashboard port (default 3000)   --no-open  never launch a browser`

/**
 * The .env changes that `--host` and the bind-decides auth gate require: persist the host so the
 * launchd/systemd service (which reads .env, not our process env) actually rebinds, and generate a
 * password the first time the bind goes non-loopback so the gate locks instead of refusing.
 */
export function planHostEnvUpdates(input: {
  argHost?: string
  fileEnv: Record<string, string>
  processEnv: Record<string, string | undefined>
  generate?: () => string
}): { updates: Record<string, string>; generatedPassword?: string } {
  const { argHost, fileEnv, processEnv } = input
  const updates: Record<string, string> = {}
  if (argHost && fileEnv.DASHBOARD_HOST !== argHost) updates.DASHBOARD_HOST = argHost
  const targetHost = argHost ?? fileEnv.DASHBOARD_HOST ?? processEnv.DASHBOARD_HOST
  if (
    !isLoopbackHost(targetHost) &&
    !fileEnv.DASHBOARD_PASSWORD &&
    !processEnv.DASHBOARD_PASSWORD
  ) {
    const generatedPassword = (input.generate ?? (() => randomBytes(16).toString('base64url')))()
    updates.DASHBOARD_PASSWORD = generatedPassword
    return { updates, generatedPassword }
  }
  return { updates }
}

function ourPids(root: string): number[] {
  const pids: number[] = []
  try {
    const list = execSync(
      "pgrep -f 'scripts/serve.sh|node_modules/.bin/next|\\.mastra/output/index.mjs|next-server|src/gateway.ts'",
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    for (const pid of list.split(/\s+/).filter(Boolean)) {
      try {
        const cwd = execSync(`lsof -a -p ${pid} -d cwd -Fn`, {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        })
          .split('\n')
          .find((l) => l.startsWith('n'))
          ?.slice(1)
        if (cwd && cwd.startsWith(root)) pids.push(Number(pid))
      } catch {
        /* gone */
      }
    }
  } catch {
    /* none */
  }
  return pids
}

function restartService(root: string): void {
  if (launchdLoaded()) {
    restartLaunchd()
    return
  }
  for (const pid of ourPids(root)) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      /* gone */
    }
  }
  ensureServiceRunning(root)
}

export async function runDashboardCommand(
  root: string,
  argv: string[],
  opts: OpenOptions = {},
): Promise<void> {
  const args = parseDashboardArgs(argv)
  if (args.host) process.env.DASHBOARD_HOST = args.host
  const port = args.port ?? Number(process.env.DASHBOARD_PORT ?? 3000)
  const url = `http://localhost:${port}`
  if (args.action === 'open' || args.action === 'restart' || args.action === 'foreground') {
    const envFile = join(root, '.env')
    const envText = existsSync(envFile) ? readFileSync(envFile, 'utf8') : ''
    const fileEnv = parseEnv(envText)
    if (!process.env.DASHBOARD_HOST && fileEnv.DASHBOARD_HOST)
      process.env.DASHBOARD_HOST = fileEnv.DASHBOARD_HOST
    if (!process.env.DASHBOARD_PASSWORD && fileEnv.DASHBOARD_PASSWORD)
      process.env.DASHBOARD_PASSWORD = fileEnv.DASHBOARD_PASSWORD
    const { updates, generatedPassword } = planHostEnvUpdates({
      ...(args.host ? { argHost: args.host } : {}),
      fileEnv,
      processEnv: process.env,
    })
    if (Object.keys(updates).length > 0) {
      writeFileSync(envFile, mergeEnv(envText, updates))
      if (updates.DASHBOARD_HOST)
        say(`Saved DASHBOARD_HOST=${updates.DASHBOARD_HOST} to .env — the service binds from there`)
      if (generatedPassword) {
        process.env.DASHBOARD_PASSWORD = generatedPassword
        say(
          `Non-local bind needs a password — generated one and saved it to .env: ${pc.bold(generatedPassword)}`,
        )
      }
      if (args.action !== 'foreground' && (launchdLoaded() || ourPids(root).length > 0)) {
        say('Restarting the service to apply it…')
        restartService(root)
      }
    }
  }
  if (args.action === 'help') {
    if (args.error) console.error(pc.red(args.error))
    console.log(DASHBOARD_HELP)
    if (args.error) process.exitCode = 1
    return
  }
  if (args.action === 'status') {
    const dash = await waitForHttp(`${url}/login`, 2000)
    const agent = await waitForHttp('http://localhost:4111/api', 2000)
    const st = launchdState()
    const ts = tailnetSelf()
    console.log(
      [
        `  dashboard   ${dash ? pc.green(`up on ${url} · ${lanUrl(port)}`) : pc.red(`not answering on ${url}`)}`,
        `  agent api   ${agent ? pc.green('up on :4111') : pc.red('not answering on :4111')}`,
        `  tailscale   ${ts ? (tailscaleServing() && ts.dnsName ? pc.green(`serving https://${ts.dnsName}`) : pc.dim(`connected (${ts.dnsName ?? ts.ip ?? '?'}) — not serving; --tailnet to share`)) : pc.dim('not detected')}`,
        `  launchd     ${launchdLoaded() ? (st?.running ? pc.green(`running (pid ${st.pid})`) : pc.red(`NOT RUNNING — ${st?.runs ?? '?'} starts, last exit ${st?.lastExit ?? '?'}${lastDistinctError(root) ? ` · ${lastDistinctError(root).slice(0, 120)}` : ''}`)) : pc.dim('not installed')}`,
        `  processes   ${ourPids(root).length} of ours`,
        `  logs        ${join(root, 'data', 'service.out.log')}`,
      ].join('\n'),
    )
    return
  }
  if (args.action === 'logs') {
    const files = ['service.out.log', 'service.err.log']
      .map((f) => join(root, 'data', f))
      .filter((f) => existsSync(f))
    if (files.length === 0)
      return say('No logs yet — the service has not been started (try --foreground).')
    say(`Following ${files.map((f) => f.split('/').pop()).join(' + ')} (Ctrl+C to stop)`)
    const child = spawn('tail', ['-n', '40', '-f', ...files], { stdio: 'inherit' })
    await new Promise<void>((resolve) => child.on('exit', () => resolve()))
    return
  }
  if (args.action === 'foreground') {
    say('Running scripts/serve.sh in the foreground (Ctrl+C stops it)')
    const child = spawn('bash', [join(root, 'scripts', 'serve.sh')], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, DASHBOARD_PORT: String(port) },
    })
    await new Promise<void>((resolve) => child.on('exit', () => resolve()))
    return
  }
  if (args.action === 'stop') {
    let stopped = 0
    if (launchdLoaded()) {
      try {
        execSync(`launchctl kill TERM gui/${process.getuid?.() ?? 501}/tech.xdcai.agent`, {
          stdio: 'ignore',
        })
        stopped++
        say(
          'Asked launchd to stop the service (it will restart at next login unless you unload it)',
        )
      } catch {
        /* not running */
      }
    }
    for (const pid of ourPids(root)) {
      try {
        process.kill(pid, 'SIGTERM')
        stopped++
      } catch {
        /* gone */
      }
    }
    say(stopped ? `Stopped ${stopped} process(es)` : 'Nothing of ours was running')
    return
  }
  if (args.action === 'restart') {
    restartService(root)
    say(launchdLoaded() ? 'Restarted the login service' : 'Started a fresh background instance')
  }
  if (args.noOpen) process.env.SSH_CONNECTION = process.env.SSH_CONNECTION ?? 'no-open'
  await openDashboard(root, port, opts)
  if (args.tailnet) {
    try {
      const tsUrl = tailscaleServe(port)
      if (tsUrl)
        say(
          `Shared over your tailnet: ${pc.bold(tsUrl)}  (tailscale serve → 127.0.0.1:${port}; \`tailscale serve reset\` undoes it)`,
        )
      else
        say(
          pc.yellow(
            'Tailscale is not running or not logged in — start Tailscale, then retry --tailnet',
          ),
        )
    } catch (e) {
      say(
        pc.yellow(
          `tailscale serve failed: ${String((e as Error).message ?? e).split('\n')[0]} — you may need to be the tailnet operator (\`tailscale set --operator=$USER\`)`,
        ),
      )
    }
  }
}

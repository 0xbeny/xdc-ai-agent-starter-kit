import { execSync, spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { hostname, userInfo } from 'node:os'
import { join } from 'node:path'

import pc from 'picocolors'

export const LAUNCHD_LABEL = 'tech.xdcai.agent'

export function launchdLoaded(): boolean {
  if (process.platform !== 'darwin') return false
  try {
    return execSync('launchctl list', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).includes(LAUNCHD_LABEL)
  } catch {
    return false
  }
}

export function restartLaunchd(): void {
  execSync(`launchctl kickstart -k gui/${process.getuid?.() ?? 501}/${LAUNCHD_LABEL}`, {
    stdio: 'ignore',
  })
}

/** Starts scripts/serve.sh detached, logging to data/service.*.log (same files launchd uses). */
export function startDetachedServe(root: string): number | undefined {
  try {
    const err = join(root, 'data', 'service.err.log')
    if (existsSync(err) && statSync(err).size > 512 * 1024) renameSync(err, `${err}.old`)
  } catch {
    /* rotation is best-effort */
  }
  const dataDir = join(root, 'data')
  mkdirSync(dataDir, { recursive: true })
  const out = openSync(join(dataDir, 'service.out.log'), 'a')
  const err = openSync(join(dataDir, 'service.err.log'), 'a')
  const child = spawn('bash', [join(root, 'scripts', 'serve.sh')], {
    cwd: root,
    detached: true,
    stdio: ['ignore', out, err],
  })
  child.unref()
  return child.pid
}

export async function waitForHttp(
  url: string,
  timeoutMs: number,
  onTick?: (elapsedMs: number) => boolean | undefined,
): Promise<boolean> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
      if (res.status < 500) return true
    } catch {
      /* not yet */
    }
    if (onTick?.(Date.now() - started) === false) return false // caller observed a fatal state
    await new Promise((r) => setTimeout(r, 1500))
  }
  return false
}

/** Starts (or restarts when `restart`) whatever runs the agent here, and reports how. */
export function ensureServiceRunning(root: string, restart = false): 'launchd' | 'detached' {
  if (launchdLoaded()) {
    if (restart) restartLaunchd()
    return 'launchd'
  }
  startDetachedServe(root)
  return 'detached'
}

export function isSsh(): boolean {
  return Boolean(process.env.SSH_CONNECTION || process.env.SSH_TTY)
}

export function tunnelHint(port: number): string {
  return `ssh -L ${port}:localhost:${port} ${userInfo().username}@${hostname()}`
}

export function readLogTail(root: string, lines = 200): string {
  const p = join(root, 'data', 'service.out.log')
  if (!existsSync(p)) return ''
  return readFileSync(p, 'utf8').split('\n').slice(-lines).join('\n')
}

export function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open'
  try {
    execSync(`${cmd} ${JSON.stringify(url)}`, { stdio: 'ignore' })
  } catch {
    /* headless */
  }
}

export function say(line: string): void {
  console.log(`${pc.cyan('▸')} ${line}`)
}

/** launchd's view of the job: running pid, or the last exit status when it died. */
export function launchdState():
  | {
      running: boolean
      pid?: number
      lastExit?: number
      runs?: number
    }
  | undefined {
  if (process.platform !== 'darwin') return undefined
  try {
    const out = execSync(`launchctl print gui/${process.getuid?.() ?? 501}/${LAUNCHD_LABEL}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const pid = /\bpid = (\d+)/.exec(out)?.[1]
    const lastExit = /last exit code = (-?\d+)/.exec(out)?.[1]
    const runs = /\bruns = (\d+)/.exec(out)?.[1]
    return {
      running: /state = running/.test(out),
      ...(pid ? { pid: Number(pid) } : {}),
      ...(lastExit ? { lastExit: Number(lastExit) } : {}),
      ...(runs ? { runs: Number(runs) } : {}),
    }
  } catch {
    return undefined
  }
}

export function readErrTail(root: string, lines = 12): string {
  const p = join(root, 'data', 'service.err.log')
  if (!existsSync(p)) return ''
  return readFileSync(p, 'utf8').split('\n').filter(Boolean).slice(-lines).join('\n')
}

/** The last error line that is not a repeat — the one signal in a crash-looped log. */
export function lastDistinctError(root: string): string {
  const tail = readErrTail(root, 200).split('\n').filter(Boolean)
  return tail.at(-1) ?? ''
}

/** URL reachable from other machines on the LAN (mDNS name on macOS, plain hostname elsewhere). */
export function lanUrl(port: number): string {
  const h = hostname()
  return `http://${h.endsWith('.local') || h.includes('.') ? h : `${h}.local`}:${port}`
}

export function isLoopbackHost(host: string | undefined): boolean {
  const h = (host ?? '127.0.0.1').trim()
  return h === '' || h === '127.0.0.1' || h === 'localhost' || h === '::1'
}

/** Installs + loads the launchd login service (same plist the installer uses). */
export function installLaunchdService(root: string): void {
  const template = readFileSync(join(root, 'deploy', 'launchd', 'tech.xdcai.agent.plist'), 'utf8')
  const dir = join(process.env.HOME ?? '', 'Library', 'LaunchAgents')
  mkdirSync(dir, { recursive: true })
  const plist = join(dir, `${LAUNCHD_LABEL}.plist`)
  writeFileSync(plist, template.replaceAll('__REPO__', root))
  try {
    execSync(`launchctl unload ${JSON.stringify(plist)}`, { stdio: 'ignore' })
  } catch {
    /* was not loaded */
  }
  execSync(`launchctl load -w ${JSON.stringify(plist)}`, { stdio: 'ignore' })
}

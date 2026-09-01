import { execSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, openSync, readFileSync } from 'node:fs'
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
  onTick?: (elapsedMs: number) => void,
): Promise<boolean> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
      if (res.status < 500) return true
    } catch {
      /* not yet */
    }
    onTick?.(Date.now() - started)
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

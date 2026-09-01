import { execSync, spawn } from 'node:child_process'
import { mkdirSync, openSync } from 'node:fs'
import { hostname, userInfo } from 'node:os'
import { join } from 'node:path'

import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import { resolveFromRoot } from './paths.ts'

async function up(url: string, ms: number): Promise<boolean> {
  const started = Date.now()
  while (Date.now() - started < ms) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
      if (res.status < 500) return true
    } catch {
      /* not yet */
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
  return false
}

function startService(root: string): 'launchd' | 'detached' {
  if (process.platform === 'darwin') {
    try {
      if (
        execSync('launchctl list', {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).includes('tech.xdcai.agent')
      ) {
        execSync(`launchctl kickstart gui/${process.getuid?.() ?? 501}/tech.xdcai.agent`, {
          stdio: 'ignore',
        })
        return 'launchd'
      }
    } catch {
      /* fall through */
    }
  }
  const dataDir = join(root, 'data')
  mkdirSync(dataDir, { recursive: true })
  const child = spawn('bash', [join(root, 'scripts', 'serve.sh')], {
    cwd: root,
    detached: true,
    stdio: [
      'ignore',
      openSync(join(dataDir, 'service.out.log'), 'a'),
      openSync(join(dataDir, 'service.err.log'), 'a'),
    ],
  })
  child.unref()
  return 'detached'
}

/**
 * Tools that operate the kit on the human's machine. Only attached when KIT_CONTEXT=cli (the terminal chat),
 * where starting the local service on request is what the human expects.
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- Mastra infers the Tool generics
export function createOpsTools() {
  const root = resolveFromRoot('.')
  const port = Number(process.env.DASHBOARD_PORT ?? 3000)
  const url = `http://localhost:${port}`
  const openDashboard = createTool({
    id: 'open_dashboard',
    description:
      'Start the web dashboard on this machine if it is not running and tell the human how to reach it. Use when they ask to open, run, start or show the dashboard/UI.',
    inputSchema: z.object({}),
    outputSchema: z.object({ ok: z.boolean(), url: z.string(), message: z.string() }),
    execute: async () => {
      let running = await up(`${url}/login`, 2500)
      let how = 'already running'
      if (!running) {
        how =
          startService(root) === 'launchd'
            ? 'started via the login service'
            : 'started in the background (first start builds the apps; about a minute)'
        running = await up(`${url}/login`, 240_000)
      }
      if (!running)
        return {
          ok: false,
          url,
          message: `The dashboard did not come up on ${url}; check ${join(root, 'data', 'service.out.log')}.`,
        }
      const ssh = process.env.SSH_CONNECTION || process.env.SSH_TTY
      const reach = ssh
        ? `The human is on SSH: they should run  ssh -L ${port}:localhost:${port} ${userInfo().username}@${hostname()}  on their laptop, then open ${url}.`
        : `Open ${url} in a browser on this machine.`
      const pw = process.env.DASHBOARD_PASSWORD
        ? 'It asks for the dashboard password set in setup.'
        : 'No dashboard password is set (localhost only).'
      if (!ssh && process.platform === 'darwin') {
        try {
          execSync(`open ${JSON.stringify(url)}`, { stdio: 'ignore' })
        } catch {
          /* headless */
        }
      }
      return { ok: true, url, message: `Dashboard ${how}. ${reach} ${pw}` }
    },
  })
  return { open_dashboard: openDashboard }
}

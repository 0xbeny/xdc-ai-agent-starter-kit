import pc from 'picocolors'

import {
  ensureServiceRunning,
  isSsh,
  openBrowser,
  readLogTail,
  say,
  tunnelHint,
  waitForHttp,
} from './service.ts'

/** `xdc-agent dashboard`: make sure the UI is being served, then show how to reach it (and open it when local). */
export async function openDashboard(root: string): Promise<void> {
  const port = Number(process.env.DASHBOARD_PORT ?? 3000)
  const url = `http://localhost:${port}`
  let up = await waitForHttp(`${url}/login`, 2500)
  if (!up) {
    const how = ensureServiceRunning(root)
    say(
      how === 'launchd'
        ? 'Starting the login service…'
        : 'Starting agent + dashboard in the background (first start builds them — about a minute)…',
    )
    let lastDot = 0
    up = await waitForHttp(`${url}/login`, 240_000, (ms) => {
      if (ms - lastDot > 10_000) {
        lastDot = ms
        process.stdout.write(pc.dim('.'))
      }
    })
    process.stdout.write('\n')
  }
  if (!up) {
    console.error(
      pc.red(`Dashboard did not come up on ${url}. Last log lines:\n`) + readLogTail(root, 25),
    )
    process.exit(1)
  }
  say(`Dashboard: ${pc.bold(url)}`)
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

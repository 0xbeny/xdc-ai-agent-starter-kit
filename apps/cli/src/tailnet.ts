import { execFileSync } from 'node:child_process'

/** Tailscale detection and `tailscale serve` control for `xdc-agent dashboard`. */

const MAC_APP_BIN = '/Applications/Tailscale.app/Contents/MacOS/Tailscale'

export function tailscaleBin(): string | undefined {
  for (const bin of ['tailscale', MAC_APP_BIN]) {
    try {
      execFileSync(bin, ['version'], { stdio: 'ignore' })
      return bin
    } catch {
      /* try next */
    }
  }
  return undefined
}

export interface TailnetSelf {
  dnsName?: string
  ip?: string
  online: boolean
}

export function parseTailscaleStatus(json: string): TailnetSelf | undefined {
  try {
    const status = JSON.parse(json) as {
      BackendState?: string
      Self?: { DNSName?: string; TailscaleIPs?: string[] }
    }
    if (!status?.Self) return undefined
    const dnsName =
      typeof status.Self.DNSName === 'string' ? status.Self.DNSName.replace(/\.$/, '') : undefined
    const ip = Array.isArray(status.Self.TailscaleIPs) ? status.Self.TailscaleIPs[0] : undefined
    return {
      ...(dnsName ? { dnsName } : {}),
      ...(ip ? { ip } : {}),
      online: status.BackendState === 'Running',
    }
  } catch {
    return undefined
  }
}

export function tailnetSelf(bin = tailscaleBin()): TailnetSelf | undefined {
  if (!bin) return undefined
  try {
    return parseTailscaleStatus(
      execFileSync(bin, ['status', '--json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    )
  } catch {
    return undefined
  }
}

export function tailnetHttpUrl(self: TailnetSelf, port: number): string | undefined {
  const host = self.dnsName ?? self.ip
  return host ? `http://${host}:${port}` : undefined
}

export function tailscaleServing(bin = tailscaleBin()): boolean {
  if (!bin) return false
  try {
    const out = execFileSync(bin, ['serve', 'status'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return out.length > 0 && !/^No serve config/i.test(out)
  } catch {
    return false
  }
}

/** `tailscale serve --bg <port>`: https://<magicdns> → 127.0.0.1:<port>, tailnet-only. Throws with tailscale's stderr on failure. */
export function tailscaleServe(port: number, bin = tailscaleBin()): string | undefined {
  if (!bin) return undefined
  const self = tailnetSelf(bin)
  if (!self?.online) return undefined
  execFileSync(bin, ['serve', '--bg', String(port)], { stdio: ['ignore', 'ignore', 'pipe'] })
  return self.dnsName ? `https://${self.dnsName}` : undefined
}

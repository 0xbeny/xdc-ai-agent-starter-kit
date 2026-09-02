import { describe, expect, it } from 'vitest'

import { parseTailscaleStatus, tailnetHttpUrl } from './tailnet.ts'

describe('parseTailscaleStatus', () => {
  it('extracts self identity and strips the trailing MagicDNS dot', () => {
    const self = parseTailscaleStatus(
      JSON.stringify({
        BackendState: 'Running',
        Self: { DNSName: 'mac-mini.tail1234.ts.net.', TailscaleIPs: ['100.64.0.7', 'fd7a::1'] },
      }),
    )
    expect(self).toEqual({ dnsName: 'mac-mini.tail1234.ts.net', ip: '100.64.0.7', online: true })
  })
  it('reports offline backends', () => {
    const self = parseTailscaleStatus(
      JSON.stringify({ BackendState: 'Stopped', Self: { TailscaleIPs: ['100.64.0.7'] } }),
    )
    expect(self?.online).toBe(false)
  })
  it('returns undefined for garbage or selfless output', () => {
    expect(parseTailscaleStatus('not json')).toBeUndefined()
    expect(parseTailscaleStatus('{}')).toBeUndefined()
  })
})

describe('tailnetHttpUrl', () => {
  it('prefers the MagicDNS name and falls back to the IP', () => {
    expect(tailnetHttpUrl({ dnsName: 'mac.ts.net', ip: '100.64.0.7', online: true }, 3000)).toBe(
      'http://mac.ts.net:3000',
    )
    expect(tailnetHttpUrl({ ip: '100.64.0.7', online: true }, 3000)).toBe('http://100.64.0.7:3000')
    expect(tailnetHttpUrl({ online: true }, 3000)).toBeUndefined()
  })
})

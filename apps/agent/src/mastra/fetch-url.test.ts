import { createServer } from 'node:http'
import { mkdtempSync, readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { blockedUrl, fetchUrlToDir, safeFilename } from './fetch-url.ts'

const server = createServer((req, res) => {
  if (req.url === '/doc.pdf') {
    res.writeHead(200, { 'content-type': 'application/pdf' })
    res.end('%PDF-1.4 fake')
  } else {
    res.writeHead(404)
    res.end()
  }
})
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
const port = (server.address() as AddressInfo).port
afterAll(() => server.close())

describe('blockedUrl', () => {
  it('refuses non-http, private and loopback targets by default', () => {
    expect(blockedUrl('ftp://x')).toBeTruthy()
    expect(blockedUrl('nonsense')).toBeTruthy()
    for (const h of [
      'http://localhost/x',
      'http://127.0.0.1/x',
      'http://10.0.0.5/x',
      'http://192.168.1.10/x',
      'http://172.20.1.1/x',
      'http://mini.local/x',
    ])
      expect(blockedUrl(h)).toBeTruthy()
    expect(blockedUrl('https://example.com/a.pdf')).toBeUndefined()
    expect(blockedUrl('http://127.0.0.1/x', true)).toBeUndefined()
  })
})

describe('safeFilename', () => {
  it('derives from the URL and strips hostile characters', () => {
    expect(safeFilename(undefined, 'https://x.y/files/report.pdf?dl=1')).toBe('report.pdf')
    expect(safeFilename('../../etc/passwd', 'https://x.y/a')).toBe('etc_passwd')
    expect(safeFilename(undefined, 'https://x.y/')).toBe('download.bin')
  })
})

describe('fetchUrlToDir', () => {
  it('downloads into the dir and reports HTTP errors', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fetch-'))
    const ok = await fetchUrlToDir(dir, { url: `http://127.0.0.1:${port}/doc.pdf` }, true)
    expect(ok.ok).toBe(true)
    expect(ok.contentType).toContain('pdf')
    expect(readFileSync(ok.path as string, 'utf8')).toContain('%PDF')
    const missing = await fetchUrlToDir(dir, { url: `http://127.0.0.1:${port}/nope` }, true)
    expect(missing.ok).toBe(false)
    expect(missing.status).toBe(404)
    const blocked = await fetchUrlToDir(dir, { url: `http://127.0.0.1:${port}/doc.pdf` })
    expect(blocked.ok).toBe(false)
  })
})

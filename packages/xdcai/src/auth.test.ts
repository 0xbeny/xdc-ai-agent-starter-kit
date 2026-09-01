import { mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  deviceLogin,
  FileAuthStore,
  tokensAreFresh,
  XdcaiAuthError,
  XdcaiOAuthProvider,
} from './auth.ts'

const store = () => new FileAuthStore(join(mkdtempSync(join(tmpdir(), 'auth-')), 'xdcai-auth.json'))

describe('FileAuthStore', () => {
  it('round-trips and keeps 0600 permissions', () => {
    const s = store()
    expect(s.read()).toEqual({})
    s.write({ client: { client_id: 'abc' } })
    s.write({ tokens: { access_token: 't', token_type: 'Bearer', obtained_at: 1 } })
    expect(s.read().client?.client_id).toBe('abc')
    expect(s.read().tokens?.access_token).toBe('t')
    expect(statSync(s.path).mode & 0o777).toBe(0o600)
    s.clear()
    expect(s.read().tokens).toBeUndefined()
  })
})

describe('tokensAreFresh', () => {
  it('treats tokens without expiry as fresh and applies a one-minute margin', () => {
    expect(tokensAreFresh(undefined)).toBe(false)
    expect(
      tokensAreFresh({ access_token: 'a', token_type: 'Bearer', obtained_at: 0 }, 10_000),
    ).toBe(true)
    const t = { access_token: 'a', token_type: 'Bearer', obtained_at: 0, expires_in: 120 }
    expect(tokensAreFresh(t, 30_000)).toBe(true)
    expect(tokensAreFresh(t, 61_000)).toBe(false)
  })
})

describe('XdcaiOAuthProvider', () => {
  it('serves stored credentials and refuses interactive redirects', () => {
    const s = store()
    const p = new XdcaiOAuthProvider(s)
    expect(p.tokens()).toBeUndefined()
    p.saveClientInformation({ client_id: 'c1' })
    p.saveTokens({ access_token: 'x', token_type: 'Bearer', expires_in: 3600 })
    expect(p.clientInformation()?.client_id).toBe('c1')
    expect(p.tokens()?.access_token).toBe('x')
    expect(() => p.redirectToAuthorization()).toThrow(XdcaiAuthError)
    p.invalidateCredentials('tokens')
    expect(p.tokens()).toBeUndefined()
    expect(p.clientInformation()?.client_id).toBe('c1')
  })
})

function fakeServer(script: { tokenResponses: Record<string, unknown>[] }) {
  const calls: { url: string; body?: string }[] = []
  let tokenIdx = 0
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, ...(typeof init?.body === 'string' ? { body: init.body } : {}) })
    if (url.endsWith('/.well-known/oauth-authorization-server')) {
      return json(200, {
        issuer: 'https://as.test',
        token_endpoint: 'https://as.test/token',
        registration_endpoint: 'https://as.test/register',
        device_authorization_endpoint: 'https://as.test/device',
      })
    }
    if (url === 'https://as.test/register') return json(201, { client_id: 'reg-client' })
    if (url === 'https://as.test/device') {
      return json(200, {
        device_code: 'dev-1',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://as.test/activate',
        verification_uri_complete: 'https://as.test/activate?user_code=ABCD-EFGH',
        expires_in: 600,
        interval: 5,
      })
    }
    if (url === 'https://as.test/token') {
      const r = script.tokenResponses[tokenIdx++] ?? {
        status: 400,
        body: { error: 'expired_token' },
      }
      return json((r as { status: number }).status, (r as { body: unknown }).body)
    }
    return json(404, {})
  }) as typeof fetch
  return { fetchFn, calls }
}

describe('deviceLogin', () => {
  it('registers a client, shows the code, polls until tokens arrive and stores them', async () => {
    const s = store()
    const server = fakeServer({
      tokenResponses: [
        { status: 400, body: { error: 'authorization_pending' } },
        { status: 400, body: { error: 'slow_down' } },
        {
          status: 200,
          body: {
            access_token: 'AT',
            refresh_token: 'RT',
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'wallet',
          },
        },
      ],
    })
    const sleeps: number[] = []
    let shown: string | undefined
    let clock = 1_000_000
    const tokens = await deviceLogin({
      store: s,
      fetchFn: server.fetchFn,
      sleep: async (ms) => {
        sleeps.push(ms)
        clock += ms
      },
      now: () => clock,
      onCode: (info) => {
        shown = `${info.userCode} @ ${info.verificationUri}`
      },
      authorizationServer: 'https://as.test',
      resource: 'https://api.test',
    })
    expect(shown).toBe('ABCD-EFGH @ https://as.test/activate')
    expect(tokens.access_token).toBe('AT')
    expect(sleeps).toEqual([5000, 5000, 10000])
    expect(s.read().client?.client_id).toBe('reg-client')
    expect(s.read().tokens?.refresh_token).toBe('RT')
    const deviceCall = server.calls.find((c) => c.url === 'https://as.test/device')
    expect(deviceCall?.body).toContain('client_id=reg-client')
    expect(deviceCall?.body).toContain('resource=https%3A%2F%2Fapi.test')
  })

  it('reuses a stored client and surfaces a declined login', async () => {
    const s = store()
    s.write({ client: { client_id: 'existing' } })
    const server = fakeServer({
      tokenResponses: [{ status: 400, body: { error: 'access_denied' } }],
    })
    await expect(
      deviceLogin({
        store: s,
        fetchFn: server.fetchFn,
        sleep: async () => undefined,
        onCode: () => undefined,
        authorizationServer: 'https://as.test',
      }),
    ).rejects.toThrow(/declined/)
    expect(server.calls.some((c) => c.url === 'https://as.test/register')).toBe(false)
  })

  it('times out when the code expires', async () => {
    const s = store()
    const server = fakeServer({
      tokenResponses: Array(50).fill({ status: 400, body: { error: 'authorization_pending' } }),
    })
    let clock = 0
    await expect(
      deviceLogin({
        store: s,
        fetchFn: server.fetchFn,
        sleep: async (ms) => {
          clock += ms * 30
        },
        now: () => clock,
        onCode: () => undefined,
        authorizationServer: 'https://as.test',
      }),
    ).rejects.toThrow(/timed out/)
  })
})

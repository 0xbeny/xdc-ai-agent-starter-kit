import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ConnectorAuthProvider, connectorStore, finishConnect, startConnect } from './oauth.ts'
import { connectorById } from './registry.ts'

const mk = (env: Record<string, string> = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'conn-'))
  const def = connectorById('gmail')!
  return new ConnectorAuthProvider(
    def,
    connectorStore(dir, def.id),
    'http://localhost:4111/api/kit/connectors/gmail/callback',
    env,
  )
}

describe('ConnectorAuthProvider', () => {
  it('prefers a pre-registered client from env and switches auth method accordingly', () => {
    const p = mk({ GOOGLE_OAUTH_CLIENT_ID: 'cid', GOOGLE_OAUTH_CLIENT_SECRET: 'sec' })
    expect(p.clientInformation()).toEqual({ client_id: 'cid', client_secret: 'sec' })
    expect(p.clientMetadata.token_endpoint_auth_method).toBe('client_secret_post')
    expect(p.clientMetadata.scope).toContain('gmail.readonly')
    expect(p.redirectUrl).toMatch(/\/callback$/)
  })

  it('falls back to DCR-stored client information', () => {
    const p = mk()
    expect(p.clientInformation()).toBeUndefined()
    p.saveClientInformation({ client_id: 'dyn' })
    expect(p.clientInformation()?.client_id).toBe('dyn')
    expect(p.clientMetadata.token_endpoint_auth_method).toBe('none')
  })

  it('captures the authorization URL instead of opening a browser', () => {
    const p = mk()
    p.redirectToAuthorization(new URL('https://accounts.example/auth?x=1'))
    expect(p.pendingAuthorizationUrl?.toString()).toBe('https://accounts.example/auth?x=1')
  })
})

describe('startConnect / finishConnect', () => {
  it('returns a redirect when the SDK asks for authorization, then completes with the code', async () => {
    const p = mk()
    const calls: unknown[] = []
    const authFn = (async (
      provider: ConnectorAuthProvider,
      opts: { authorizationCode?: string },
    ) => {
      calls.push(opts)
      if (opts.authorizationCode) {
        provider.saveTokens({ access_token: 'AT', token_type: 'Bearer' })
        return 'AUTHORIZED'
      }
      provider.saveCodeVerifier('verifier')
      const state = provider.state()
      provider.redirectToAuthorization(new URL(`https://accounts.example/auth?state=${state}`))
      return 'REDIRECT'
    }) as never
    const start = await startConnect(p, authFn)
    expect(start.status).toBe('redirect')
    const state = new URL(start.authorizationUrl!).searchParams.get('state')!
    await expect(finishConnect(p, 'code-1', 'wrong', authFn)).rejects.toThrow(/state mismatch/)
    await finishConnect(p, 'code-1', state, authFn)
    expect(p.tokens()?.access_token).toBe('AT')
    expect(calls).toHaveLength(2)
  })

  it('reports already-authorized connectors without a redirect', async () => {
    const p = mk()
    const result = await startConnect(p, (async () => 'AUTHORIZED') as never)
    expect(result).toEqual({ status: 'authorized' })
  })
})

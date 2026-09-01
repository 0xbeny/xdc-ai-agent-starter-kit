import { randomBytes } from 'node:crypto'

import { auth as sdkAuth, type OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js'
import { FileAuthStore } from '@xdc-ai/xdcai'

import { type ConnectorDef, clientFromEnv } from './registry.ts'

export type Env = Readonly<Record<string, string | undefined>>

/**
 * OAuth client for a vendor MCP server. Instead of opening a browser itself, it captures the
 * authorization URL so the dashboard can redirect the user; the callback route finishes the flow.
 */
export class ConnectorAuthProvider implements OAuthClientProvider {
  pendingAuthorizationUrl: URL | undefined
  readonly def: ConnectorDef
  readonly store: FileAuthStore
  readonly callbackUrl: string
  private readonly env: Env

  constructor(def: ConnectorDef, store: FileAuthStore, callbackUrl: string, env: Env) {
    this.def = def
    this.store = store
    this.callbackUrl = callbackUrl
    this.env = env
  }

  get redirectUrl(): string {
    return this.callbackUrl
  }

  get clientMetadata(): OAuthClientMetadata {
    const preset = clientFromEnv(this.def, this.env)
    return {
      client_name: `xdc-ai-agent-starter-kit (${this.def.id})`,
      redirect_uris: [this.callbackUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: preset?.client_secret ? 'client_secret_post' : 'none',
      ...(this.def.scopes ? { scope: this.def.scopes.join(' ') } : {}),
    }
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    return clientFromEnv(this.def, this.env) ?? this.store.read().client
  }

  saveClientInformation(client: OAuthClientInformationMixed): void {
    this.store.write({ client })
  }

  tokens(): OAuthTokens | undefined {
    return this.store.read().tokens
  }

  saveTokens(tokens: OAuthTokens): void {
    this.store.write({ tokens: { ...tokens, obtained_at: Date.now() } })
  }

  redirectToAuthorization(url: URL): void {
    this.pendingAuthorizationUrl = url
  }

  saveCodeVerifier(codeVerifier: string): void {
    this.store.write({ codeVerifier })
  }

  codeVerifier(): string {
    const v = this.store.read().codeVerifier
    if (!v)
      throw new Error(`No PKCE verifier stored for ${this.def.id}; start the connection again`)
    return v
  }

  state(): string {
    const state = randomBytes(16).toString('hex')
    this.store.write({ state } as never)
    return state
  }

  expectedState(): string | undefined {
    return (this.store.read() as { state?: string }).state
  }

  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): void {
    if (scope === 'all') this.store.clear()
    else if (scope === 'tokens') this.store.write({ tokens: undefined })
    else if (scope === 'client') this.store.write({ client: undefined })
    else if (scope === 'verifier') this.store.write({ codeVerifier: undefined })
  }
}

export type AuthFn = typeof sdkAuth

export interface StartResult {
  status: 'authorized' | 'redirect'
  authorizationUrl?: string
}

/** Begins (or silently completes, when tokens exist) the OAuth flow for a connector. */
export async function startConnect(
  provider: ConnectorAuthProvider,
  authFn: AuthFn = sdkAuth,
): Promise<StartResult> {
  provider.pendingAuthorizationUrl = undefined
  const scope = provider.def.scopes?.join(' ')
  const result = await authFn(provider, {
    serverUrl: provider.def.url,
    ...(scope ? { scope } : {}),
  })
  if (result === 'AUTHORIZED') return { status: 'authorized' }
  // read through a local: TS cannot see that authFn mutated the property
  const pending = provider.pendingAuthorizationUrl as URL | undefined
  if (!pending) throw new Error('Authorization server did not provide an authorization URL')
  return { status: 'redirect', authorizationUrl: pending.toString() }
}

/** Exchanges the code from the callback; verifies state when the server echoed one. */
export async function finishConnect(
  provider: ConnectorAuthProvider,
  code: string,
  state: string | undefined,
  authFn: AuthFn = sdkAuth,
): Promise<void> {
  const expected = provider.expectedState()
  if (expected && state !== expected)
    throw new Error('OAuth state mismatch; start the connection again')
  const result = await authFn(provider, { serverUrl: provider.def.url, authorizationCode: code })
  if (result !== 'AUTHORIZED') throw new Error(`Token exchange did not complete (${result})`)
}

export function connectorStore(dataDir: string, id: string): FileAuthStore {
  return new FileAuthStore(`${dataDir}/connectors/${id}.json`)
}

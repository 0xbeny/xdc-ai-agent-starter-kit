import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js'

import { XDCAI } from './chain.ts'

export class XdcaiAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'XdcaiAuthError'
  }
}

export interface StoredTokens extends OAuthTokens {
  obtained_at: number
}

export interface StoredAuth {
  client?: OAuthClientInformationMixed | undefined
  tokens?: StoredTokens | undefined
  codeVerifier?: string | undefined
}

/**
 * xdcai.tech's registration endpoint requires an https or loopback redirect URI even for device-code
 * clients, so we register a loopback one (never listened on) alongside the device grant.
 */
export const CLIENT_METADATA: OAuthClientMetadata = {
  client_name: 'xdc-ai-agent-starter-kit',
  redirect_uris: ['http://127.0.0.1/callback'],
  grant_types: [
    'authorization_code',
    'urn:ietf:params:oauth:grant-type:device_code',
    'refresh_token',
  ],
  response_types: ['code'],
  token_endpoint_auth_method: 'none',
  scope: 'wallet',
}

/** JSON file with 0600 permissions holding the OAuth client registration and tokens. Never commit it. */
export class FileAuthStore {
  readonly path: string

  constructor(path: string) {
    this.path = path
  }

  read(): StoredAuth {
    if (!existsSync(this.path)) return {}
    try {
      return JSON.parse(readFileSync(this.path, 'utf8')) as StoredAuth
    } catch {
      return {}
    }
  }

  write(patch: Partial<StoredAuth>): StoredAuth {
    const next = { ...this.read(), ...patch }
    mkdirSync(dirname(this.path), { recursive: true })
    const tmp = `${this.path}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(next, null, 2), { mode: 0o600 })
    renameSync(tmp, this.path)
    chmodSync(this.path, 0o600)
    return next
  }

  clear(): void {
    if (existsSync(this.path))
      this.write({ client: undefined, tokens: undefined, codeVerifier: undefined })
  }
}

/** Tokens are considered fresh if they don't expire within the next minute. */
export function tokensAreFresh(
  tokens: StoredTokens | undefined,
  now: number = Date.now(),
): boolean {
  if (!tokens?.access_token) return false
  if (tokens.expires_in === undefined) return true
  return tokens.obtained_at + tokens.expires_in * 1000 - 60_000 > now
}

/**
 * OAuthClientProvider for Mastra's MCPClient. Login happens out of band (device flow in the wizard);
 * this provider only serves stored credentials and lets the SDK refresh them.
 */
export class XdcaiOAuthProvider implements OAuthClientProvider {
  readonly store: FileAuthStore

  constructor(store: FileAuthStore) {
    this.store = store
  }

  get redirectUrl(): undefined {
    return undefined
  }

  get clientMetadata(): OAuthClientMetadata {
    return CLIENT_METADATA
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    return this.store.read().client
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

  redirectToAuthorization(): void {
    throw new XdcaiAuthError(
      'Not connected to XDC AI. Run `pnpm setup` (or `pnpm xdc-agent login`) to link your smart wallet.',
    )
  }

  saveCodeVerifier(codeVerifier: string): void {
    this.store.write({ codeVerifier })
  }

  codeVerifier(): string {
    const v = this.store.read().codeVerifier
    if (!v) throw new XdcaiAuthError('No PKCE verifier stored')
    return v
  }

  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): void {
    if (scope === 'all') this.store.clear()
    else if (scope === 'client') this.store.write({ client: undefined })
    else if (scope === 'tokens') this.store.write({ tokens: undefined })
    else if (scope === 'verifier') this.store.write({ codeVerifier: undefined })
  }
}

// ---------- device authorization grant (RFC 8628) ----------

interface AsMetadata {
  issuer: string
  token_endpoint: string
  registration_endpoint?: string
  device_authorization_endpoint?: string
  scopes_supported?: string[]
}

export interface DeviceCodeInfo {
  userCode: string
  verificationUri: string
  verificationUriComplete?: string
  expiresIn: number
  interval: number
}

export interface DeviceLoginOptions {
  store: FileAuthStore
  onCode: (info: DeviceCodeInfo) => void | Promise<void>
  fetchFn?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  authorizationServer?: string
  resource?: string
  scope?: string
  now?: () => number
}

const form = (data: Record<string, string>): string => new URLSearchParams(data).toString()

async function postForm(
  fetchFn: typeof fetch,
  url: string,
  data: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: form(data),
  })
  let body: Record<string, unknown> = {}
  try {
    body = (await res.json()) as Record<string, unknown>
  } catch {
    /* non-JSON error page */
  }
  return { status: res.status, body }
}

/** Runs the device flow end to end and stores client + tokens. Returns the tokens. */
export async function deviceLogin(options: DeviceLoginOptions): Promise<StoredTokens> {
  const fetchFn = options.fetchFn ?? fetch
  const sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  const now = options.now ?? Date.now
  const as = (options.authorizationServer ?? XDCAI.authorizationServer).replace(/\/$/, '')
  const resource = options.resource ?? XDCAI.api
  const scope = options.scope ?? 'wallet'

  const metaRes = await fetchFn(`${as}/.well-known/oauth-authorization-server`, {
    headers: { Accept: 'application/json' },
  })
  if (!metaRes.ok)
    throw new XdcaiAuthError(`Authorization server metadata unavailable (${metaRes.status})`)
  const meta = (await metaRes.json()) as AsMetadata
  if (!meta.device_authorization_endpoint)
    throw new XdcaiAuthError('Server does not support the device flow')

  let client = options.store.read().client
  if (!client) {
    if (!meta.registration_endpoint)
      throw new XdcaiAuthError('No stored client and no registration endpoint')
    const reg = await fetchFn(meta.registration_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(CLIENT_METADATA),
    })
    if (!reg.ok) throw new XdcaiAuthError(`Client registration failed (${reg.status})`)
    client = (await reg.json()) as OAuthClientInformationMixed
    options.store.write({ client })
  }

  const dev = await postForm(fetchFn, meta.device_authorization_endpoint, {
    client_id: client.client_id,
    scope,
    resource,
  })
  if (dev.status >= 400 || typeof dev.body.device_code !== 'string') {
    throw new XdcaiAuthError(`Device authorization failed: ${String(dev.body.error ?? dev.status)}`)
  }
  const deviceCode = dev.body.device_code
  const info: DeviceCodeInfo = {
    userCode: String(dev.body.user_code ?? ''),
    verificationUri: String(dev.body.verification_uri ?? ''),
    expiresIn: Number(dev.body.expires_in ?? 600),
    interval: Number(dev.body.interval ?? 5),
  }
  if (typeof dev.body.verification_uri_complete === 'string')
    info.verificationUriComplete = dev.body.verification_uri_complete
  await options.onCode(info)

  const deadline = now() + info.expiresIn * 1000
  let interval = info.interval
  for (;;) {
    if (now() > deadline) throw new XdcaiAuthError('Login timed out; run it again')
    await sleep(interval * 1000)
    const tok = await postForm(fetchFn, meta.token_endpoint, {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: deviceCode,
      client_id: client.client_id,
      resource,
    })
    if (tok.status < 400 && typeof tok.body.access_token === 'string') {
      const tokens: StoredTokens = {
        access_token: tok.body.access_token,
        token_type: String(tok.body.token_type ?? 'Bearer'),
        obtained_at: now(),
      }
      if (typeof tok.body.refresh_token === 'string') tokens.refresh_token = tok.body.refresh_token
      if (tok.body.expires_in !== undefined) tokens.expires_in = Number(tok.body.expires_in)
      if (typeof tok.body.scope === 'string') tokens.scope = tok.body.scope
      options.store.write({ tokens })
      return tokens
    }
    const err = String(tok.body.error ?? '')
    if (err === 'authorization_pending') continue
    if (err === 'slow_down') {
      interval += 5
      continue
    }
    throw new XdcaiAuthError(
      err === 'access_denied'
        ? 'Login was declined'
        : err === 'expired_token'
          ? 'Code expired; run login again'
          : `Token request failed: ${err || tok.status}`,
    )
  }
}

import { execFileSync } from 'node:child_process'

export type Env = Record<string, string | undefined>

/** Runs a CLI and returns stdout; injectable for tests. */
export type Runner = (file: string, args: string[]) => string

export const defaultRunner: Runner = (file, args) =>
  execFileSync(file, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 20_000,
  }).trim()

export interface ResolveOptions {
  run?: Runner
  /** When true, values from the helper command overwrite values already present in env. Default: env wins. */
  override?: boolean
  log?: (line: string) => void
}

export interface ResolveResult {
  env: Env
  /** Env var names that were filled or replaced from a secret source. */
  resolved: string[]
  /** Env var names whose reference could not be resolved (left as-is). */
  failed: string[]
}

/** Parses `KEY=VALUE` lines (comments and blanks ignored; optional surrounding quotes stripped). */
export function parseKeyValues(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1)
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) out[key] = value
  }
  return out
}

/**
 * Hydrates secrets the Hermes way, without making the vault a prerequisite:
 * 1. `KEY=op://vault/item/field` → `op read` (1Password CLI)
 * 2. `KEY=bws://<secret-id>`    → `bws secret get <id>` (Bitwarden Secrets Manager CLI)
 * 3. `SECRETS_COMMAND="…"`      → any CLI printing KEY=VALUE lines; fills missing keys (or all, with override)
 * Plain values are left alone. `.env` / shell always wins unless `override` (SECRETS_OVERRIDE=1).
 */
export function resolveSecrets(input: Env, options: ResolveOptions = {}): ResolveResult {
  const run = options.run ?? defaultRunner
  const log = options.log ?? (() => undefined)
  const env: Env = { ...input }
  const resolved: string[] = []
  const failed: string[] = []

  for (const [key, value] of Object.entries(env)) {
    if (!value) continue
    try {
      if (value.startsWith('op://')) {
        env[key] = run('op', ['read', '--no-newline', value])
        resolved.push(key)
      } else if (value.startsWith('bws://')) {
        const id = value.slice('bws://'.length)
        const json = run('bws', ['secret', 'get', id, '--output', 'json'])
        const parsed = JSON.parse(json) as { value?: unknown }
        if (typeof parsed.value !== 'string') throw new Error('bws returned no value')
        env[key] = parsed.value
        resolved.push(key)
      }
    } catch (error) {
      failed.push(key)
      log(`secret ${key}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const helper = env.SECRETS_COMMAND?.trim()
  if (helper) {
    try {
      const kv = parseKeyValues(run('/bin/sh', ['-c', helper]))
      const override = options.override ?? env.SECRETS_OVERRIDE === '1'
      for (const [key, value] of Object.entries(kv)) {
        if (key === 'SECRETS_COMMAND') continue
        if (!override && env[key]) continue
        env[key] = value
        if (!resolved.includes(key)) resolved.push(key)
      }
    } catch (error) {
      failed.push('SECRETS_COMMAND')
      log(`SECRETS_COMMAND failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return { env, resolved, failed }
}

/** Names that look like credentials; their values are what the redactor masks. */
export function secretKeys(env: Env): string[] {
  return Object.keys(env).filter(
    (k) =>
      /(_API_KEY|_SECRET|_TOKEN|PASSWORD|PRIVATE_KEY|MNEMONIC|SEED)$/i.test(k) ||
      /^(KIT_API_TOKEN|DASHBOARD_PASSWORD)$/.test(k),
  )
}

/** Replaces every known secret value (≥ 8 chars) in a string with a masked marker. */
export function makeRedactor(env: Env): (text: string) => string {
  const values = secretKeys(env)
    .map((k) => env[k])
    .filter((v): v is string => typeof v === 'string' && v.length >= 8)
    .sort((a, b) => b.length - a.length)
  if (values.length === 0) return (t) => t
  return (text) => values.reduce((acc, v) => acc.split(v).join(`***${v.slice(-3)}`), text)
}

/** Wraps console.* so a leaked key in a log line comes out masked. Idempotent. */
export function installConsoleRedaction(env: Env): void {
  const c = console as Console & { __kitRedacted?: boolean }
  if (c.__kitRedacted) return
  const redact = makeRedactor(env)
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const orig = console[level].bind(console)
    console[level] = (...args: unknown[]) =>
      orig(...args.map((a) => (typeof a === 'string' ? redact(a) : a)))
  }
  c.__kitRedacted = true
}

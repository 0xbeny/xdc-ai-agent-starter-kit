import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import * as p from '@clack/prompts'
import {
  parseUsdc,
  formatUsdc,
  DEFAULT_POLICY,
  FileAuthStore,
  deviceLogin,
  hasWalletSession,
  createXdcaiMcp,
} from '@xdc-ai/xdcai'
import pc from 'picocolors'

import { mergeEnv, parseEnv } from './env-file.ts'
import { envKeyFor, modelSpecString, PROVIDERS, providerById } from './providers.ts'
import { smokeTest } from './smoke.ts'

export interface WizardPaths {
  root: string
  envFile: string
  dataDir: string
  workspaceDir: string
}

const bail = (value: unknown): void => {
  if (p.isCancel(value)) {
    p.cancel('Setup cancelled. Nothing was written.')
    process.exit(0)
  }
}

function which(bin: string): boolean {
  try {
    execSync(`command -v ${bin}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open'
  try {
    execSync(`${cmd} ${JSON.stringify(url)}`, { stdio: 'ignore' })
  } catch {
    /* headless — the URL is printed anyway */
  }
}

async function askModel(
  label: string,
  current: Record<string, string>,
  envKeyOf: string,
): Promise<{ spec: string; env: Record<string, string> } | null> {
  const providerId = await p.select({
    message: `${label}: which provider?`,
    options: PROVIDERS.map((x) => ({ value: x.id, label: x.label, hint: x.hint })),
    initialValue: current[envKeyOf]?.split('/')[0] ?? 'anthropic',
  })
  bail(providerId)
  const provider = providerById(providerId as string)
  if (!provider) return null

  if (provider.cli && !which(provider.cli)) {
    p.log.warn(
      `\`${provider.cli}\` is not on your PATH. Install it and run \`${provider.loginCommand}\`, then re-run setup.`,
    )
    const cont = await p.confirm({ message: 'Continue anyway?', initialValue: false })
    bail(cont)
    if (!cont) return null
  }

  const model = await p.text({
    message: `${label}: model id`,
    placeholder: provider.defaultModel,
    defaultValue: provider.defaultModel,
    validate: (v) => (v?.trim() || provider.defaultModel ? undefined : 'Model id is required'),
  })
  bail(model)

  let url: string | undefined
  if (provider.askUrl) {
    const u = await p.text({
      message: 'Base URL of the OpenAI-compatible server (ending in /v1)',
      placeholder: 'http://localhost:8000/v1',
      validate: (v) => {
        try {
          new URL(v ?? '')
          return undefined
        } catch {
          return 'Enter a full http(s) URL'
        }
      },
    })
    bail(u)
    url = u as string
  }

  const env: Record<string, string> = {}
  const keyName = envKeyFor(provider.id)
  if (keyName) {
    const existing = current[keyName]
    const key = await p.password({
      message: `${keyName}${existing ? ' (leave blank to keep the saved one)' : ''}`,
      validate: (v) => (existing || v?.trim() ? undefined : 'A key is required for this provider'),
    })
    bail(key)
    if ((key as string).trim()) env[keyName] = (key as string).trim()
  }
  return {
    spec: modelSpecString(provider.id, (model as string) || provider.defaultModel, url),
    env,
  }
}

export async function runSetup(paths: WizardPaths): Promise<void> {
  p.intro(pc.bgCyan(pc.black(' xdc-ai-agent-starter-kit · setup ')))
  const existingText = existsSync(paths.envFile) ? readFileSync(paths.envFile, 'utf8') : ''
  const current = parseEnv(existingText)
  const updates: Record<string, string | undefined> = {}

  // 1. chat model
  const chat = await askModel('Chat model', current, 'MODEL_CHAT')
  if (!chat) return p.outro('Setup stopped before writing anything.')
  updates.MODEL_CHAT = chat.spec
  Object.assign(updates, chat.env)

  const test = await p.confirm({
    message: `Send a test message through ${chat.spec}?`,
    initialValue: true,
  })
  bail(test)
  if (test) {
    const s = p.spinner()
    s.start('Contacting the model…')
    const result = await smokeTest(chat.spec, { ...process.env, ...current, ...updates })
    if (result.ok) s.stop(`Reply in ${result.ms} ms: ${pc.dim(JSON.stringify(result.text))}`)
    else {
      s.stop(pc.red(`No reply: ${result.error ?? 'unknown error'}`))
      const go = await p.confirm({
        message: 'Save this configuration anyway?',
        initialValue: false,
      })
      bail(go)
      if (!go) return p.outro('Nothing written. Fix the provider/key and run setup again.')
    }
  }

  // 2. fast model
  const separateFast = await p.confirm({
    message: 'Use a separate cheap/fast model for summaries and background memory work?',
    initialValue: false,
  })
  bail(separateFast)
  if (separateFast) {
    const fast = await askModel('Fast model', current, 'MODEL_FAST')
    if (fast) {
      updates.MODEL_FAST = fast.spec
      Object.assign(updates, fast.env)
    }
  } else {
    updates.MODEL_FAST = ''
  }

  // 3. storage
  const storage = await p.select({
    message: 'Where should conversations and memory live?',
    options: [
      {
        value: 'postgres',
        label: 'Postgres + pgvector from docker compose',
        hint: 'pnpm db:up · recommended',
      },
      { value: 'sqlite', label: 'Local SQLite file', hint: 'zero setup, single user' },
    ],
    initialValue: current.DATABASE_URL ? 'postgres' : which('docker') ? 'postgres' : 'sqlite',
  })
  bail(storage)
  updates.DATABASE_URL =
    storage === 'postgres'
      ? current.DATABASE_URL || 'postgresql://agent:agent@localhost:5432/agent'
      : ''

  // 4. XDC AI wallet
  const store = new FileAuthStore(join(paths.dataDir, 'xdcai-auth.json'))
  const connected = hasWalletSession(store)
  const doLogin = await p.confirm({
    message: connected
      ? 'XDC AI wallet is already connected. Log in again?'
      : 'Connect your XDC AI smart wallet now? (XDC mainnet, USDC)',
    initialValue: !connected,
  })
  bail(doLogin)
  if (doLogin) await login(store)

  // 5. payment policy
  p.note(
    [
      'Every paid call is checked locally before it happens:',
      '• below the auto-approve threshold → runs on its own',
      '• at/above it, any transfer or DeFi action → waits for your approval',
      '• above the per-call max or the daily cap → refused',
    ].join('\n'),
    'Payment policy',
  )
  const askUsdc = async (message: string, key: string, fallback: bigint): Promise<string> => {
    const v = await p.text({
      message,
      defaultValue: current[key] || formatUsdc(fallback),
      placeholder: formatUsdc(fallback),
      validate: (x) => {
        try {
          parseUsdc(x || formatUsdc(fallback))
          return undefined
        } catch (e) {
          return e instanceof Error ? e.message : 'Invalid amount'
        }
      },
    })
    bail(v)
    return formatUsdc(parseUsdc((v as string) || formatUsdc(fallback)))
  }
  updates.PAY_AUTO_APPROVE_BELOW_USDC = await askUsdc(
    'Auto-approve calls below (USDC)',
    'PAY_AUTO_APPROVE_BELOW_USDC',
    DEFAULT_POLICY.autoApproveBelow,
  )
  updates.PAY_PER_CALL_MAX_USDC = await askUsdc(
    'Per-call maximum (USDC)',
    'PAY_PER_CALL_MAX_USDC',
    DEFAULT_POLICY.perCallMax,
  )
  updates.PAY_DAILY_CAP_USDC = await askUsdc(
    'Daily cap (USDC)',
    'PAY_DAILY_CAP_USDC',
    DEFAULT_POLICY.dailyCap,
  )

  // 6. connectors & channels (recorded now, wired in the dashboard phase)
  const connectors = await p.multiselect({
    message: 'Workplace connectors to enable (OAuth happens in the dashboard)',
    options: [
      { value: 'slack', label: 'Slack' },
      { value: 'google', label: 'Google Workspace (Gmail, Drive, Calendar…)' },
      { value: 'notion', label: 'Notion' },
      { value: 'github', label: 'GitHub' },
    ],
    initialValues: (current.CONNECTORS ?? '').split(',').filter(Boolean),
    required: false,
  })
  bail(connectors)
  updates.CONNECTORS = (connectors as string[]).join(',')
  const channels = await p.multiselect({
    message: 'Chat channels to enable',
    options: [{ value: 'telegram', label: 'Telegram', hint: 'bot token asked when wiring' }],
    initialValues: (current.CHANNELS ?? '').split(',').filter(Boolean),
    required: false,
  })
  bail(channels)
  updates.CHANNELS = (channels as string[]).join(',')

  // 7. write
  writeFileSync(paths.envFile, mergeEnv(existingText, updates))
  seedWorkspace(paths.workspaceDir)
  p.note(
    [
      `${pc.bold('.env')} written (secrets stay local; it is git-ignored).`,
      storage === 'postgres'
        ? `Start the database:   ${pc.cyan('pnpm db:up')}`
        : 'Storage: local SQLite under ./data',
      `Run the agent:        ${pc.cyan('pnpm dev')}  →  http://localhost:4111`,
      `Edit your agent:      ${pc.cyan('workspace/SOUL.md')}, ${pc.cyan('workspace/AGENTS.md')}`,
    ].join('\n'),
    'Next',
  )
  p.outro('Done.')
}

export async function login(store: FileAuthStore): Promise<void> {
  const s = p.spinner()
  s.start('Requesting a device code from xdcai.tech…')
  try {
    await deviceLogin({
      store,
      onCode: (info) => {
        s.stop('Approve this device in your browser')
        const url = info.verificationUriComplete ?? info.verificationUri
        p.note(
          `${pc.bold('Code:')} ${pc.cyan(info.userCode)}\n${pc.bold('URL:')}  ${url}`,
          'XDC AI login',
        )
        openBrowser(url)
        s.start('Waiting for approval…')
      },
    })
    s.stop(pc.green('Wallet connected.'))
    try {
      const mcp = createXdcaiMcp(store)
      const tools = (await mcp.listTools()) as unknown as Record<
        string,
        { execute?: (i: unknown) => Promise<unknown> }
      >
      const addr = await tools.xdcai_wallet_address?.execute?.({})
      if (addr) p.log.info(`Wallet: ${pc.dim(JSON.stringify(addr).slice(0, 200))}`)
      await mcp.disconnect?.()
    } catch (error) {
      p.log.warn(
        `Connected, but could not read the wallet yet: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  } catch (error) {
    s.stop(pc.red(`Login failed: ${error instanceof Error ? error.message : String(error)}`))
  }
}

function seedWorkspace(dir: string): void {
  if (existsSync(join(dir, 'SOUL.md'))) return
  p.log.warn(`No SOUL.md in ${dir}; the agent will use a plain default persona until you add one.`)
}

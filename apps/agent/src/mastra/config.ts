import { join } from 'node:path'

import { missingKeys, type ModelSlots, resolveModelSlots } from '@xdc-ai/models'
import { ensureWorkspace } from '@xdc-ai/workspace'
import { DEFAULT_POLICY, parseUsdc, type PolicyConfig } from '@xdc-ai/xdcai'

import { resolveFromRoot } from './paths.ts'

export interface AgentConfig {
  env: Readonly<Record<string, string | undefined>>
  workspaceDir: string
  templatesDir: string
  dataDir: string
  authFile: string
  ledgerFile: string
  slots: ModelSlots
  missingKeys: string[]
  policy: PolicyConfig
}

function usdc(
  env: Readonly<Record<string, string | undefined>>,
  key: string,
  fallback: bigint,
): bigint {
  const raw = env[key]?.trim()
  return raw ? parseUsdc(raw) : fallback
}

/** Everything the agent reads from the environment, in one place, resolved once. */
export function loadConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): AgentConfig {
  const dataDir = resolveFromRoot(env.AGENT_DATA_DIR?.trim() || './data')
  const slots = resolveModelSlots(env)
  const policy: PolicyConfig = {
    autoApproveBelow: usdc(env, 'PAY_AUTO_APPROVE_BELOW_USDC', DEFAULT_POLICY.autoApproveBelow),
    perCallMax: usdc(env, 'PAY_PER_CALL_MAX_USDC', DEFAULT_POLICY.perCallMax),
    dailyCap: usdc(env, 'PAY_DAILY_CAP_USDC', DEFAULT_POLICY.dailyCap),
  }
  const allow = env.PAY_ALLOWED_PROVIDERS?.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (allow && allow.length > 0) policy.allowedProviders = allow
  const workspaceDir = resolveFromRoot(env.AGENT_WORKSPACE?.trim() || './workspace')
  const templatesDir = resolveFromRoot(env.AGENT_TEMPLATES?.trim() || './templates/workspace')
  const seeded = ensureWorkspace(workspaceDir, templatesDir)
  if (seeded.seeded)
    console.info(`[agent] seeded workspace at ${workspaceDir} from ${templatesDir}`)
  return {
    env,
    workspaceDir,
    templatesDir,
    dataDir,
    authFile: join(dataDir, 'xdcai-auth.json'),
    ledgerFile: join(dataDir, 'ledger.jsonl'),
    slots,
    missingKeys: missingKeys(slots, env),
    policy,
  }
}

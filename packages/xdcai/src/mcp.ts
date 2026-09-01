import { createTool } from '@mastra/core/tools'
import { MCPClient } from '@mastra/mcp'
import { z } from 'zod'

import { type FileAuthStore, tokensAreFresh, XdcaiOAuthProvider } from './auth.ts'
import { Catalog } from './catalog.ts'
import { XDCAI } from './chain.ts'
import { guard, MONEY_TOOLS } from './guard.ts'
import type { ApprovalStore } from './approvals.ts'
import type { PaymentPolicy } from './policy.ts'

export const XDCAI_SERVER_NAME = 'xdcai'

/** True when a wallet session exists locally (access token fresh, or a refresh token to renew it). */
export function hasWalletSession(store: FileAuthStore): boolean {
  const tokens = store.read().tokens
  return tokensAreFresh(tokens) || typeof tokens?.refresh_token === 'string'
}

export function createXdcaiMcp(
  store: FileAuthStore,
  options: { url?: string; timeout?: number } = {},
): MCPClient {
  return new MCPClient({
    id: 'xdcai-mcp',
    servers: {
      [XDCAI_SERVER_NAME]: {
        url: new URL(options.url ?? XDCAI.mcpUrl),
        authProvider: new XdcaiOAuthProvider(store),
        timeout: options.timeout ?? 60_000,
      },
    },
  })
}

/** Loose view of the tool objects Mastra's MCPClient returns; only what the adapter needs. */
interface McpToolLike {
  id?: string
  description?: string
  inputSchema?: unknown
  outputSchema?: unknown
  execute?: (input: unknown, context?: unknown) => Promise<unknown>
}

export interface XdcaiToolsOptions {
  mcp: MCPClient
  policy: PaymentPolicy
  approvals?: ApprovalStore
  /** Fetch the marketplace catalog; called once at startup and cached. */
  loadCatalog?: (tools: Record<string, McpToolLike>) => Promise<Catalog | undefined>
  runId?: () => string | undefined
}

const stripPrefix = (name: string): string =>
  name.startsWith(`${XDCAI_SERVER_NAME}_`) ? name.slice(XDCAI_SERVER_NAME.length + 1) : name

/** Reads the marketplace through the MCP server itself so prices come from the same source the agent pays. */
export async function defaultLoadCatalog(
  tools: Record<string, McpToolLike>,
): Promise<Catalog | undefined> {
  const list =
    tools[`${XDCAI_SERVER_NAME}_marketplace_list`] ?? tools[`${XDCAI_SERVER_NAME}_get_service_info`]
  if (!list?.execute) return undefined
  const raw = await list.execute({})
  const items = findMarketplaceArray(raw)
  return items ? Catalog.from(items) : undefined
}

function findMarketplaceArray(value: unknown, depth = 0): unknown[] | undefined {
  if (depth > 6 || value === null || value === undefined) return undefined
  if (typeof value === 'string') {
    try {
      return findMarketplaceArray(JSON.parse(value), depth + 1)
    } catch {
      return undefined
    }
  }
  if (Array.isArray(value)) {
    if (
      value.length > 0 &&
      typeof value[0] === 'object' &&
      value[0] !== null &&
      'url' in (value[0] as object)
    )
      return value
    for (const v of value) {
      const hit = findMarketplaceArray(v, depth + 1)
      if (hit) return hit
    }
    return undefined
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    for (const key of ['marketplace', 'items', 'results', 'resources']) {
      const hit = findMarketplaceArray(o[key], depth + 1)
      if (hit) return hit
    }
    for (const v of Object.values(o)) {
      const hit = findMarketplaceArray(v, depth + 1)
      if (hit) return hit
    }
  }
  return undefined
}

/**
 * Wraps xdcai's MCP tools: read-only tools pass through; money tools get the payment policy,
 * per-call approval, idempotency and ledger recording. Returns tools keyed `xdcai_<name>`.
 */
export async function createXdcaiTools(
  options: XdcaiToolsOptions,
): Promise<Record<string, ReturnType<typeof createTool>>> {
  const raw = (await options.mcp.listTools()) as Record<string, McpToolLike>
  let catalog: Catalog | undefined
  try {
    catalog = await (options.loadCatalog ?? defaultLoadCatalog)(raw)
  } catch (error) {
    console.warn(
      `[xdcai] marketplace catalog unavailable: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  const deps = {
    policy: options.policy,
    catalog: () => catalog,
    ...(options.runId ? { runId: options.runId } : {}),
  }

  const out: Record<string, ReturnType<typeof createTool>> = {}
  for (const [fullName, tool] of Object.entries(raw)) {
    const name = stripPrefix(fullName)
    if (!tool.execute) continue
    const run = tool.execute
    const inputSchema = (tool.inputSchema ?? z.object({}).passthrough()) as z.ZodTypeAny
    const description = tool.description ?? name

    if (!(name in MONEY_TOOLS)) {
      out[fullName] = createTool({
        id: fullName,
        description,
        inputSchema,
        execute: async (input: unknown, context: unknown) => run(input, context),
      })
      continue
    }

    const guarded = guard(name, deps)
    out[fullName] = createTool({
      id: fullName,
      description: `${description}\n\nPays USDC from the agent wallet. Cheap catalog calls run automatically; larger or unknown amounts pause for human approval; duplicates of an already-paid request are refused.`,
      inputSchema,
      requireApproval: async (input: unknown) =>
        guarded.needsApproval((input ?? {}) as Record<string, unknown>),
      execute: async (input: unknown, context: unknown) => {
        const result = await guarded.execute((input ?? {}) as Record<string, unknown>, (i) =>
          run(i, context),
        )
        if (!result.ok)
          return {
            ok: false,
            error: result.error ?? 'payment failed',
            policy: result.decision.reason,
          }
        return result.result
      },
    })
  }
  return out
}

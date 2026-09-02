import { createTool } from '@mastra/core/tools'
import { MCPClient } from '@mastra/mcp'
import { type ApprovalKind, type ApprovalStore, sameInput } from '@xdc-ai/xdcai'
import { z } from 'zod'

import type { ConnectorAuthProvider } from './oauth.ts'
import { classifyTool, type ConnectorDef, type ToolClass } from './registry.ts'

export function createConnectorMcp(provider: ConnectorAuthProvider): MCPClient {
  return new MCPClient({
    id: `connector-${provider.def.id}`,
    servers: {
      [provider.def.id]: {
        url: new URL(provider.def.url),
        authProvider: provider,
        timeout: 60_000,
      },
    },
  })
}

interface ToolLike {
  description?: string
  inputSchema?: unknown
  execute?: (input: unknown, context?: unknown) => Promise<unknown>
}

export interface GateResult {
  ok: boolean
  error?: string
  approvalId?: string
  approvalStatus?: string
}

/** Shared approval protocol for non-money tools: same shape the xdcai guard uses. */
export async function approvalGate(
  approvals: ApprovalStore,
  tool: string,
  cls: ToolClass,
  input: Record<string, unknown>,
  connectorLabel: string,
  opts: { kind?: ApprovalKind; reason?: string; preview?: string } = {},
): Promise<GateResult> {
  const id = typeof input.approvalId === 'string' ? input.approvalId : undefined
  if (id) {
    const a = await approvals.get(id)
    if (!a) return { ok: false, error: `Unknown approvalId ${id}` }
    if (a.tool !== tool || !sameInput(a.input, input))
      return {
        ok: false,
        error: 'approvalId was granted for different arguments; request a new approval',
      }
    if (a.status === 'approved') {
      await approvals.consume(a.id)
      return { ok: true }
    }
    return {
      ok: false,
      approvalId: a.id,
      approvalStatus: a.status,
      error:
        a.status === 'pending'
          ? `Approval ${a.id} is still pending.`
          : `Approval ${a.id} is ${a.status}.`,
    }
  }
  const { approvalId: _drop, ...clean } = input
  const a = await approvals.create({
    tool,
    kind: opts.kind ?? 'connector',
    reason:
      opts.reason ??
      (cls === 'send'
        ? `${connectorLabel}: this leaves the workspace (send/share/invite) — review the preview`
        : `${connectorLabel}: this changes data`),
    input: clean,
    preview: opts.preview ?? JSON.stringify(clean, null, 2),
  })
  return {
    ok: false,
    approvalId: a.id,
    approvalStatus: 'pending',
    error: `approval_required: ${a.reason}. Approval id ${a.id} is waiting in the dashboard. Tell the human what you want to do, then call again with approvalId="${a.id}" once approved.`,
  }
}

export interface ConnectorToolsOptions {
  def: ConnectorDef
  mcp: MCPClient
  approvals: ApprovalStore
}

/** Wraps a connector's MCP tools: read passes through; write/send go through the approval gate. */
export async function createConnectorTools(
  options: ConnectorToolsOptions,
): Promise<Record<string, ReturnType<typeof createTool>>> {
  const raw = (await options.mcp.listTools()) as Record<string, ToolLike>
  const out: Record<string, ReturnType<typeof createTool>> = {}
  for (const [name, tool] of Object.entries(raw)) {
    if (!tool.execute) continue
    const run = tool.execute
    const cls = classifyTool(options.def, name)
    const schema = (tool.inputSchema ?? z.object({}).passthrough()) as z.ZodTypeAny
    if (cls === 'read') {
      out[name] = createTool({
        id: name,
        description: tool.description ?? name,
        inputSchema: schema,
        execute: async (i: unknown, c: unknown) => run(i, c),
      })
      continue
    }
    const gated =
      typeof (schema as { extend?: unknown }).extend === 'function'
        ? (schema as z.ZodObject<z.ZodRawShape>).extend({ approvalId: z.string().optional() })
        : schema
    out[name] = createTool({
      id: name,
      description: `${tool.description ?? name}\n\n[${cls}] Needs human approval: the first call returns approval_required with an approvalId; call again with it once approved in the dashboard.`,
      inputSchema: gated,
      execute: async (i: unknown, c: unknown) => {
        const input = (i ?? {}) as Record<string, unknown>
        const gate = await approvalGate(options.approvals, name, cls, input, options.def.label)
        if (!gate.ok) return { ...gate, ok: false }
        const { approvalId: _a, ...forward } = input
        return run(forward, c)
      },
    })
  }
  return out
}

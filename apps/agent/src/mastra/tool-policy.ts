import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { createTool } from '@mastra/core/tools'
import { approvalGate } from '@xdc-ai/connectors'
import type { ApprovalStore } from '@xdc-ai/xdcai'
import { z } from 'zod'

/**
 * Human-owned tool switchboard: every tool is on unless turned off. The human flips them with
 * /tools on|off in chat (instant, no approval); the agent may only PROPOSE a change (tools_toggle,
 * approval-gated). Disabled tools vanish from the toolset on the next turn.
 */
export class ToolPolicyStore {
  private readonly file: string

  constructor(file: string) {
    this.file = file
  }

  private read(): Record<string, 'off'> {
    if (!existsSync(this.file)) return {}
    try {
      return JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, 'off'>
    } catch {
      return {}
    }
  }

  disabled(): string[] {
    return Object.keys(this.read()).sort()
  }

  enabled(name: string): boolean {
    return this.read()[name] === undefined
  }

  set(name: string, on: boolean): void {
    const prev = this.read()
    const map: Record<string, 'off'> = on
      ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== name))
      : { ...prev, [name]: 'off' }
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, `${JSON.stringify(map, null, 2)}\n`)
  }

  /** The switchboard itself and the memory tool stay reachable so a bad toggle is always recoverable. */
  filter<T>(tools: Record<string, T>): Record<string, T> {
    const map = this.read()
    return Object.fromEntries(
      Object.entries(tools).filter(([name]) => map[name] === undefined || ALWAYS_ON.has(name)),
    )
  }
}

export const ALWAYS_ON = new Set(['tools_status', 'tools_toggle', 'memory'])

export interface ToggleResult {
  ok: boolean
  message: string
  approvalId?: string
}

export async function runToolsToggle(
  deps: { policy: ToolPolicyStore; approvals: ApprovalStore },
  input: { names: string[]; action: 'on' | 'off'; reason: string; approvalId?: string | undefined },
): Promise<ToggleResult> {
  if (input.names.length === 0) return { ok: false, message: 'names is empty' }
  const gate = await approvalGate(
    deps.approvals,
    'tools_toggle',
    'write',
    {
      names: [...input.names].sort(),
      action: input.action,
      reason: input.reason,
      ...(input.approvalId ? { approvalId: input.approvalId } : {}),
    },
    'tool switchboard',
    {
      kind: 'improve',
      reason: `turn ${input.action}: ${input.names.join(', ')} — ${input.reason}`,
      preview: input.names.join('\n'),
    },
  )
  if (!gate.ok) {
    const out: ToggleResult = { ok: false, message: gate.error ?? 'not approved' }
    if (gate.approvalId) out.approvalId = gate.approvalId
    return out
  }
  for (const name of input.names) deps.policy.set(name, input.action === 'on')
  return {
    ok: true,
    message: `${input.names.join(', ')} now ${input.action} (applies from the next turn)`,
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- Mastra infers the Tool generics
export function createToolPolicyTools(deps: { policy: ToolPolicyStore; approvals: ApprovalStore }) {
  return {
    tools_status: createTool({
      id: 'tools_status',
      description:
        'Which tools the human has switched off. Your current toolset is authoritative — a tool in your list works regardless of what earlier turns claimed.',
      inputSchema: z.object({}),
      execute: async () => ({ disabled: deps.policy.disabled() }),
    }),
    tools_toggle: createTool({
      id: 'tools_toggle',
      description:
        'Propose switching tools on or off for the human (approval-gated; they can also do it instantly with /tools on|off <name>). Applies from the next turn.',
      inputSchema: z.object({
        names: z.array(z.string()).describe('Exact tool names'),
        action: z.enum(['on', 'off']),
        reason: z.string(),
        approvalId: z.string().optional(),
      }),
      execute: async (input) => runToolsToggle(deps, input),
    }),
  }
}

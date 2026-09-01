import { z } from 'zod'

import {
  type BridgeableTool,
  type Env,
  isHarnessProvider,
  loadHarnessModel,
  type ModelSpec,
  toMastraModel,
} from '@xdc-ai/models'

interface ToolLike {
  description?: string
  inputSchema?: unknown
  execute?: (input: unknown, context?: unknown) => unknown
}

function isZodObject(schema: unknown): boolean {
  return schema instanceof z.ZodObject
}

/** Mastra tools → bridgeable tools. Only Zod-object schemas can cross the Claude Code bridge; others are skipped. */
export function toBridgeTools(tools: Record<string, unknown>): Record<string, BridgeableTool> {
  const out: Record<string, BridgeableTool> = {}
  for (const [name, raw] of Object.entries(tools)) {
    const t = raw as ToolLike
    if (!t?.execute || !isZodObject(t.inputSchema)) continue
    const run = t.execute
    out[name] = {
      ...(t.description ? { description: t.description } : {}),
      inputSchema: t.inputSchema,
      execute: (input: unknown) => run(input, {}),
    }
  }
  return out
}

/**
 * Model factory for an agent. Router providers resolve once; harness providers (claude-code, codex) are rebuilt
 * whenever the tool set changes, because their tools must be bridged at construction time.
 */
export function createModelFactory(
  spec: ModelSpec,
  env: Env,
  tools: () => Promise<Record<string, unknown>>,
): () => Promise<unknown> {
  if (!isHarnessProvider(spec.provider)) {
    const model = toMastraModel(spec, env)
    return async () => model
  }
  let cacheKey = ''
  let cached: Promise<unknown> | undefined
  return async () => {
    const current = await tools()
    const key = Object.keys(current).sort().join(',')
    if (!cached || key !== cacheKey) {
      cacheKey = key
      const bridge = toBridgeTools(current)
      const skipped = Object.keys(current).length - Object.keys(bridge).length
      console.info(
        `[agent] ${spec.provider}: bridging ${Object.keys(bridge).length} tools as MCP${skipped ? ` (${skipped} skipped: non-object schema)` : ''}`,
      )
      cached = loadHarnessModel(spec, {
        bridgeTools: bridge,
        settings: { cwd: env.AGENT_DATA_DIR ?? process.cwd() },
      })
    }
    return cached
  }
}

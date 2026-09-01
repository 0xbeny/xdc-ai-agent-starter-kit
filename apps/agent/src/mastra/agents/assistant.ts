import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'
import { describeModel, resolveModel } from '@xdc-ai/models'
import { createMemoryTool, createSkillTools, loadWorkspace } from '@xdc-ai/workspace'
import {
  createXdcaiMcp,
  createXdcaiTools,
  FileAuthStore,
  hasWalletSession,
  JsonlLedger,
  PaymentPolicy,
} from '@xdc-ai/xdcai'

import { loadConfig } from '../config.ts'
import { createStorage } from '../storage.ts'

const config = loadConfig()
if (config.missingKeys.length > 0) {
  console.warn(
    `[agent] missing provider keys: ${config.missingKeys.join(', ')} — set them in .env or run pnpm setup`,
  )
}
console.info(
  `[agent] workspace: ${config.workspaceDir} · chat model: ${describeModel(config.slots.chat)}`,
)

const authStore = new FileAuthStore(config.authFile)
const policy = new PaymentPolicy(config.policy, new JsonlLedger(config.ledgerFile))

let xdcaiTools: Promise<Record<string, unknown>> | undefined
function loadXdcaiTools(): Promise<Record<string, unknown>> {
  if (!xdcaiTools) {
    xdcaiTools = (async () => {
      if (!hasWalletSession(authStore)) {
        console.info(
          '[agent] XDC AI wallet not connected — run `pnpm setup` to enable marketplace and wallet tools',
        )
        return {}
      }
      try {
        const tools = await createXdcaiTools({ mcp: createXdcaiMcp(authStore), policy })
        console.info(`[agent] xdcai tools: ${Object.keys(tools).length}`)
        return tools
      } catch (error) {
        console.warn(
          `[agent] xdcai tools unavailable: ${error instanceof Error ? error.message : String(error)}`,
        )
        return {}
      }
    })()
  }
  return xdcaiTools
}

const model = resolveModel(config.slots.chat, config.env)

export const assistant = new Agent({
  id: 'assistant',
  name: 'Assistant',
  // Re-read on every run so edits to SOUL.md / MEMORY.md from the dashboard or the memory tool apply next turn.
  instructions: () => loadWorkspace(config.workspaceDir).prompt,
  model: async () => (await model) as never,
  tools: async () => ({
    memory: createMemoryTool(config.workspaceDir),
    ...createSkillTools(config.workspaceDir),
    ...(await loadXdcaiTools()),
  }),
  memory: new Memory({
    storage: createStorage(config.env),
    options: { lastMessages: 20 },
  }),
})

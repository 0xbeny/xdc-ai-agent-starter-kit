import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'
import { describeModel, resolveModel } from '@xdc-ai/models'
import { createMemoryTool, createSkillTools, loadWorkspace } from '@xdc-ai/workspace'

import { getKit } from '../kit.ts'
import { createStorage } from '../storage.ts'

const kit = getKit()
const { config } = kit
if (config.missingKeys.length > 0) {
  console.warn(
    `[agent] missing provider keys: ${config.missingKeys.join(', ')} — set them in .env or run pnpm setup`,
  )
}
console.info(
  `[agent] workspace: ${config.workspaceDir} · chat model: ${describeModel(config.slots.chat)}`,
)

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
    ...(await kit.xdcaiTools()),
    ...(await kit.connectorToolsAll()),
  }),
  memory: new Memory({
    storage: createStorage(config.env),
    options: { lastMessages: 20 },
  }),
})

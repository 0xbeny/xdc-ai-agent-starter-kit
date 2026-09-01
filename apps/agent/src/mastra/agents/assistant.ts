import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'
import { describeModel, resolveModel } from '@xdc-ai/models'
import { createMemoryTool, createSkillTools, loadWorkspace } from '@xdc-ai/workspace'

import { getKit } from '../kit.ts'
import { createSandboxTools, sandboxMode } from '../sandbox.ts'
import { createStorage } from '../storage.ts'

import { researcher } from './researcher.ts'
import { treasurer } from './treasurer.ts'

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

const sandbox =
  sandboxMode(config.env) === 'local'
    ? createSandboxTools({
        dataDir: config.dataDir,
        allowNetwork: config.env.SANDBOX_ALLOW_NETWORK === '1',
      })
    : undefined
if (sandbox)
  console.info(`[agent] sandbox: local · ${sandbox.isolation} isolation · ${sandbox.dir}`)

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
    ...(sandbox?.tools ?? {}),
  }),
  // Delegation: sub-agents appear as tools `agent-researcher` / `agent-treasurer`; the researcher may run in the background.
  agents: { researcher, treasurer },
  backgroundTasks: {
    tools: { 'agent-researcher': { enabled: true, timeoutMs: 10 * 60 * 1000 } },
    concurrency: 2,
  },
  memory: new Memory({
    storage: createStorage(config.env),
    options: { lastMessages: 20 },
  }),
})

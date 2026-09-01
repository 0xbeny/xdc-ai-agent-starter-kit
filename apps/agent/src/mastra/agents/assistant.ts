import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'
import { missingKeys, resolveModelSlots, toMastraModel } from '@xdc-ai/models'

import { resolveFromRoot } from '../paths.ts'
import { createStorage } from '../storage.ts'
import { loadInstructions } from '../workspace.ts'

const env = process.env
const slots = resolveModelSlots(env)
const missing = missingKeys(slots, env)
if (missing.length > 0) {
  console.warn(
    `[agent] missing provider keys: ${missing.join(', ')} — set them in .env or run pnpm setup`,
  )
}

const workspaceDir = resolveFromRoot(env.AGENT_WORKSPACE?.trim() || './workspace')
console.info(
  `[agent] workspace: ${workspaceDir} · model: ${slots.chat.provider}/${slots.chat.model}`,
)

export const assistant = new Agent({
  id: 'assistant',
  name: 'Assistant',
  instructions: loadInstructions(workspaceDir),
  model: toMastraModel(slots.chat, env),
  memory: new Memory({
    storage: createStorage(env),
    options: { lastMessages: 20 },
  }),
})

import { Mastra } from '@mastra/core'

import { assistant } from './agents/assistant.ts'
import { createStorage } from './storage.ts'

export const mastra = new Mastra({
  agents: { assistant },
  storage: createStorage(process.env),
})

import { registerCopilotKit } from '@ag-ui/mastra/copilotkit'
import { Mastra } from '@mastra/core'

import { assistant } from './agents/assistant.ts'
import { kitRoutes } from './api.ts'
import { getKit } from './kit.ts'
import { createStorage } from './storage.ts'

const kit = getKit()
const dashboardOrigin = kit.config.env.DASHBOARD_URL?.trim() || 'http://localhost:3000'

export const mastra = new Mastra({
  agents: { assistant },
  storage: createStorage(kit.config.env),
  bundler: { externals: ['@copilotkit/runtime'] },
  server: {
    cors: {
      origin: [dashboardOrigin],
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'x-kit-token'],
    },
    apiRoutes: [
      registerCopilotKit({ path: '/copilotkit', resourceId: 'admin' }),
      ...kitRoutes(kit),
    ],
  },
})

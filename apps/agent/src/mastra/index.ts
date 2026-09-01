import { registerCopilotKit } from '@ag-ui/mastra/copilotkit'
import { randomUUID } from 'node:crypto'

import { Mastra } from '@mastra/core'

import { assistant } from './agents/assistant.ts'
import { researcher } from './agents/researcher.ts'
import { treasurer } from './agents/treasurer.ts'
import { kitRoutes } from './api.ts'
import { getKit } from './kit.ts'
import { createStorage } from './storage.ts'

const kit = getKit()
const dashboardOrigin = kit.config.env.DASHBOARD_URL?.trim() || 'http://localhost:3000'

export const mastra = new Mastra({
  agents: { assistant, researcher, treasurer },
  storage: createStorage(kit.config.env),
  bundler: { externals: ['@copilotkit/runtime'] },
  schedules: {
    onFinish: (ctx) => {
      const c = ctx as unknown as {
        agentId: string
        schedule: { id: string; name?: string }
        result?: { text?: string }
      }
      kit.routineRuns.append({
        id: randomUUID(),
        at: new Date().toISOString(),
        scheduleId: c.schedule.id,
        ...(c.schedule.name ? { name: c.schedule.name } : {}),
        agentId: c.agentId,
        status: 'ok',
        ...(c.result?.text ? { text: c.result.text } : {}),
      })
    },
    onError: (ctx) => {
      const c = ctx as unknown as {
        agentId: string
        schedule: { id: string; name?: string }
        error?: unknown
      }
      kit.routineRuns.append({
        id: randomUUID(),
        at: new Date().toISOString(),
        scheduleId: c.schedule.id,
        ...(c.schedule.name ? { name: c.schedule.name } : {}),
        agentId: c.agentId,
        status: 'error',
        error: c.error instanceof Error ? c.error.message : String(c.error ?? 'unknown error'),
      })
    },
  },
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

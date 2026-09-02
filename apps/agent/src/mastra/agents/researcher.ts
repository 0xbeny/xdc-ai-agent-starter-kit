import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'
import { resolveModel } from '@xdc-ai/models'

import { getKit } from '../kit.ts'
import { fetchTools, sandbox } from '../shared-tools.ts'
import { createStorage } from '../storage.ts'

const kit = getKit()
const model = resolveModel(kit.config.slots.fast, kit.config.env)

/** Delegated research: reads, searches, summarises. Cannot pay or send anything. */
export const researcher = new Agent({
  id: 'researcher',
  name: 'Researcher',
  description:
    'Delegate reading-heavy work: search the marketplace catalog, read connected docs/mail/channels, compare sources and return a sourced summary. Cannot spend money or send messages.',
  instructions: [
    'You are the research sub-agent. You receive one delegated question and return a compact, sourced answer.',
    'Use only read-only tools. fetch_url downloads files into the sandbox and run_command processes them there — use them yourself. If a task needs a paid call, a message, or a change outside the sandbox, say exactly what is needed and stop.',
    'Lead with the answer, then bullet evidence with sources. Be explicit about uncertainty.',
  ].join('\n'),
  model: async () => (await model) as never,
  tools: async () => {
    const all = { ...(await kit.xdcaiTools()), ...(await kit.connectorToolsAll()) }
    const readOnly = Object.fromEntries(
      Object.entries(all).filter(
        ([name]) =>
          !/(call|transfer|defi_|payee|authorize|send|create|update|delete|write|post|upload|move|archive)/i.test(
            name,
          ),
      ),
    )
    return { ...readOnly, ...fetchTools, ...(sandbox?.tools ?? {}) } as never
  },
  memory: new Memory({
    storage: createStorage(kit.config.env),
    options: { lastMessages: 10 },
  }),
})

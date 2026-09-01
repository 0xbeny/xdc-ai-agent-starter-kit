import { Agent } from '@mastra/core/agent'
import { createModelFactory } from '../model.ts'

import { getKit } from '../kit.ts'

const kit = getKit()

const readOnlyTools = async (): Promise<Record<string, unknown>> => {
  const all = { ...(await kit.xdcaiTools()), ...(await kit.connectorToolsAll()) }
  return Object.fromEntries(
    Object.entries(all).filter(
      ([name]) =>
        !/(call|transfer|defi_|payee|authorize|send|create|update|delete|write|post|upload|move|archive)/i.test(
          name,
        ),
    ),
  )
}
const model = createModelFactory(kit.config.slots.fast, kit.config.env, readOnlyTools)

/** Delegated research: reads, searches, summarises. Cannot pay or send anything. */
export const researcher = new Agent({
  id: 'researcher',
  name: 'Researcher',
  description:
    'Delegate reading-heavy work: search the marketplace catalog, read connected docs/mail/channels, compare sources and return a sourced summary. Cannot spend money or send messages.',
  instructions: [
    'You are the research sub-agent. You receive one delegated question and return a compact, sourced answer.',
    'Use only read-only tools. If a task needs a paid call, a message, or a change, say exactly what is needed and stop.',
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
    return readOnly as never
  },
})

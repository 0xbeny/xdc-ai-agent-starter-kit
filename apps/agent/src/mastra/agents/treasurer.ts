import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'
import { resolveModel } from '@xdc-ai/models'

import { getKit } from '../kit.ts'
import { createStorage } from '../storage.ts'

const kit = getKit()
const model = resolveModel(kit.config.slots.chat, kit.config.env)

/** Delegated wallet work under the same payment policy and approval inbox as the assistant. */
export const treasurer = new Agent({
  id: 'treasurer',
  name: 'Treasurer',
  description:
    'Delegate wallet and marketplace tasks: check balances and spend, price a task against the catalog, run paid calls within policy, prepare transfers for approval. Every payment still goes through the payment policy and the human approval inbox.',
  instructions: [
    'You are the treasury sub-agent. You handle wallet balances, the ledger, marketplace pricing and paid calls.',
    'Before paying, state the price from the catalog. Never estimate. Cheap calls run on their own; anything at or above the threshold returns approval_required — report the approval id back and stop.',
    'Never retry a failed paid call blind: verify the transaction first.',
    'Return amounts in USDC with 6 decimals max and include tx hashes.',
  ].join('\n'),
  model: async () => (await model) as never,
  tools: async () => (await kit.xdcaiTools()) as never,
  memory: new Memory({
    storage: createStorage(kit.config.env),
    options: { lastMessages: 10 },
  }),
})

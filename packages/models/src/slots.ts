import { type Env, type ModelSpec, ModelSpecError, parseModelSpec, providerEnvKey } from './spec.ts'

export interface ModelSlots {
  /** Main conversational model. */
  chat: ModelSpec
  /** Cheap model for routing, summaries and background memory work. Defaults to `chat`. */
  fast: ModelSpec
  /** Embedding model for semantic recall and knowledge search. Optional until RAG is enabled. */
  embed?: ModelSpec
}

function read(env: Env, key: string): string | undefined {
  const value = env[key]?.trim()
  return value === undefined || value === '' ? undefined : value
}

export function resolveModelSlots(env: Env): ModelSlots {
  const chatRaw = read(env, 'MODEL_CHAT')
  if (chatRaw === undefined) {
    throw new ModelSpecError('MODEL_CHAT is not set. Run `pnpm setup` or copy .env.example to .env')
  }
  const chat = parseModelSpec(chatRaw)
  const fastRaw = read(env, 'MODEL_FAST')
  const embedRaw = read(env, 'MODEL_EMBED')
  const slots: ModelSlots = { chat, fast: fastRaw === undefined ? chat : parseModelSpec(fastRaw) }
  if (embedRaw !== undefined) slots.embed = parseModelSpec(embedRaw)
  return slots
}

/** Env var names the configured providers need that are missing or blank. */
export function missingKeys(slots: ModelSlots, env: Env): string[] {
  const specs = [slots.chat, slots.fast, ...(slots.embed ? [slots.embed] : [])]
  const needed = new Set<string>()
  for (const spec of specs) {
    const key = providerEnvKey(spec.provider)
    if (key !== null && read(env, key) === undefined) needed.add(key)
  }
  return [...needed]
}

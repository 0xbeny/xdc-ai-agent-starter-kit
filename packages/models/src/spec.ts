export interface ModelSpec {
  provider: string
  model: string
  url?: string
}

export type ModelId = `${string}/${string}`

export type MastraModel = ModelId | { id: ModelId; url: string; apiKey?: string }

export class ModelSpecError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModelSpecError'
  }
}

const KEYLESS_PROVIDERS = new Set(['ollama', 'lmstudio', 'custom', 'claude-code', 'codex'])

const KNOWN_ENV_KEYS: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  xai: 'XAI_API_KEY',
  moonshot: 'MOONSHOT_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  groq: 'GROQ_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  mistral: 'MISTRAL_API_KEY',
}

// Providers the Mastra router does not resolve natively but that speak the OpenAI wire format.
const OPENAI_COMPATIBLE_BASE_URLS: Record<string, (env: Env) => string> = {
  moonshot: () => 'https://api.moonshot.ai/v1',
  ollama: (env) => `${(env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/$/, '')}/v1`,
  lmstudio: (env) => `${(env.LMSTUDIO_BASE_URL ?? 'http://localhost:1234').replace(/\/$/, '')}/v1`,
}

export type Env = Readonly<Record<string, string | undefined>>

/**
 * Accepts `provider/model`, `gateway/provider/model`, or `provider/model@http://host/v1`.
 * Only the first slash splits provider from model, so nested gateway ids and `name:tag` survive.
 */
export function parseModelSpec(raw: string): ModelSpec {
  const input = raw.trim()
  if (input === '') throw new ModelSpecError('Model spec is empty')

  const at = input.indexOf('@')
  const idPart = at === -1 ? input : input.slice(0, at)
  const urlPart = at === -1 ? undefined : input.slice(at + 1)

  const slash = idPart.indexOf('/')
  if (slash <= 0 || slash === idPart.length - 1) {
    throw new ModelSpecError(
      `Model spec "${input}" must look like provider/model (e.g. openai/gpt-5.6), not provider:model`,
    )
  }
  const provider = idPart.slice(0, slash)
  const model = idPart.slice(slash + 1)

  if (urlPart === undefined) return { provider, model }

  let url: URL
  try {
    url = new URL(urlPart)
  } catch {
    throw new ModelSpecError(`"${urlPart}" is not a valid base URL`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ModelSpecError(`Base URL must be http(s), got ${url.protocol}`)
  }
  return { provider, model, url: urlPart }
}

export function providerEnvKey(provider: string): string | null {
  if (KEYLESS_PROVIDERS.has(provider)) return null
  return KNOWN_ENV_KEYS[provider] ?? `${provider.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`
}

/** Converts a spec into the value Mastra's `model` option accepts. */
export function toMastraModel(spec: ModelSpec, env: Env): MastraModel {
  const id: ModelId = `${spec.provider}/${spec.model}`
  const url = spec.url ?? OPENAI_COMPATIBLE_BASE_URLS[spec.provider]?.(env)
  if (url === undefined) return id

  const keyName = `${spec.provider.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`
  const apiKey = env[keyName]
  return apiKey === undefined || apiKey === '' ? { id, url } : { id, url, apiKey }
}

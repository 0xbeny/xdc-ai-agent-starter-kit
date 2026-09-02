import { HARNESS_PROVIDERS, providerEnvKey } from '@xdc-ai/models'

export interface ProviderChoice {
  id: string
  label: string
  hint: string
  defaultModel: string
  /** Env var for the key, or null when the provider is keyless. */
  envKey: string | null
  /** Ask for an OpenAI-compatible base URL. */
  askUrl?: boolean
  /** Local CLI that must be installed and logged in. */
  cli?: string
  installCommand?: string
  loginCommand?: string
}

export const PROVIDERS: ProviderChoice[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    hint: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-sonnet-4-6',
    envKey: 'ANTHROPIC_API_KEY',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    hint: 'OPENAI_API_KEY',
    defaultModel: 'gpt-5.6',
    envKey: 'OPENAI_API_KEY',
  },
  {
    id: 'xai',
    label: 'xAI (Grok)',
    hint: 'XAI_API_KEY',
    defaultModel: 'grok-4.3',
    envKey: 'XAI_API_KEY',
  },
  {
    id: 'moonshot',
    label: 'Moonshot (Kimi)',
    hint: 'MOONSHOT_API_KEY · api.moonshot.ai',
    defaultModel: 'kimi-k2.7',
    envKey: 'MOONSHOT_API_KEY',
  },
  {
    id: 'google',
    label: 'Google (Gemini)',
    hint: 'GOOGLE_GENERATIVE_AI_API_KEY',
    defaultModel: 'gemini-2.5-pro',
    envKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    hint: 'one key, 7,000+ models',
    defaultModel: 'anthropic/claude-sonnet-4-6',
    envKey: 'OPENROUTER_API_KEY',
  },
  {
    id: 'groq',
    label: 'Groq',
    hint: 'fast open models',
    defaultModel: 'llama-4-maverick',
    envKey: 'GROQ_API_KEY',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    hint: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-v4',
    envKey: 'DEEPSEEK_API_KEY',
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    hint: 'no key · localhost:11434',
    defaultModel: 'qwen3:8b',
    envKey: null,
  },
  {
    id: 'claude-code',
    label: HARNESS_PROVIDERS['claude-code'].label,
    hint: 'your Claude subscription — the wizard sets it up',
    defaultModel: HARNESS_PROVIDERS['claude-code'].defaultModel,
    envKey: null,
    cli: HARNESS_PROVIDERS['claude-code'].cli,
    installCommand: HARNESS_PROVIDERS['claude-code'].installCommand,
    loginCommand: HARNESS_PROVIDERS['claude-code'].loginCommand,
  },
  {
    id: 'codex',
    label: HARNESS_PROVIDERS.codex.label,
    hint: 'your ChatGPT subscription — the wizard sets it up',
    defaultModel: HARNESS_PROVIDERS.codex.defaultModel,
    envKey: null,
    cli: HARNESS_PROVIDERS.codex.cli,
    installCommand: HARNESS_PROVIDERS.codex.installCommand,
    loginCommand: HARNESS_PROVIDERS.codex.loginCommand,
  },
  {
    id: 'custom',
    label: 'Custom OpenAI-compatible server',
    hint: 'vLLM, LM Studio, LiteLLM, …',
    defaultModel: '',
    envKey: null,
    askUrl: true,
  },
]

export function providerById(id: string): ProviderChoice | undefined {
  return PROVIDERS.find((p) => p.id === id)
}

/** Builds the MODEL_* spec string from wizard answers. */
export function modelSpecString(providerId: string, model: string, url?: string): string {
  const base = `${providerId}/${model.trim()}`
  return url && url.trim() !== '' ? `${base}@${url.trim().replace(/\/$/, '')}` : base
}

export function envKeyFor(providerId: string): string | null {
  const known = providerById(providerId)
  return known ? known.envKey : providerEnvKey(providerId)
}

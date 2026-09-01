import type { ModelSpec } from './spec.ts'

/**
 * "Harness" providers run the model through a locally installed coding-agent CLI and its own login,
 * so the kit can use a personal Claude Pro/Max or ChatGPT subscription instead of an API key.
 * They are optional dependencies; the adapter loads them lazily and explains what to install if missing.
 */
export interface HarnessDescriptor {
  /** npm package that exposes an AI SDK provider factory. */
  pkg: string
  /** Named export that creates the provider; called as `factory(settings)(modelId)`. */
  factory: string
  defaultModel: string
  /** Binary that must be installed and logged in. */
  cli: string
  loginCommand: string
  label: string
  note: string
}

export const HARNESS_PROVIDERS = {
  'claude-code': {
    pkg: 'ai-sdk-provider-claude-code',
    factory: 'createClaudeCode',
    defaultModel: 'sonnet',
    cli: 'claude',
    loginCommand: 'claude auth login',
    label: 'Claude Code (your Claude subscription, local CLI)',
    note: "Routes through the Claude Agent SDK and the `claude` CLI login. Personal use of your own subscription; companies should use an API key (Anthropic's terms govern subscription use in third-party tools).",
  },
  codex: {
    pkg: 'ai-sdk-provider-codex-cli',
    factory: 'createCodexCli',
    defaultModel: 'gpt-5.5',
    cli: 'codex',
    loginCommand: 'codex login',
    label: 'Codex CLI (your ChatGPT subscription, local CLI)',
    note: 'Routes through the OpenAI Codex CLI login (~/.codex/auth.json) or OPENAI_API_KEY.',
  },
} as const satisfies Record<string, HarnessDescriptor>

export type HarnessProvider = keyof typeof HARNESS_PROVIDERS

export function isHarnessProvider(provider: string): provider is HarnessProvider {
  return Object.hasOwn(HARNESS_PROVIDERS, provider)
}

export class HarnessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HarnessError'
  }
}

export type Importer = (pkg: string) => Promise<Record<string, unknown>>

/** Minimal structural view of an AI SDK language model; Mastra accepts V2–V4 instances directly. */
export interface LanguageModelLike {
  specificationVersion: string
  provider: string
  modelId: string
}

export function isLanguageModelLike(value: unknown): value is LanguageModelLike {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.specificationVersion === 'string' &&
    typeof v.modelId === 'string' &&
    typeof v.doGenerate === 'function'
  )
}

const defaultImporter: Importer = (pkg) => import(pkg) as Promise<Record<string, unknown>>

export interface LoadHarnessOptions {
  importer?: Importer
  /** Passed to the provider factory (e.g. `pathToClaudeCodeExecutable`, `env`). */
  settings?: Record<string, unknown>
}

export async function loadHarnessModel(
  spec: ModelSpec,
  options: LoadHarnessOptions = {},
): Promise<LanguageModelLike> {
  if (!isHarnessProvider(spec.provider)) {
    throw new HarnessError(`"${spec.provider}" is not a harness provider`)
  }
  const desc = HARNESS_PROVIDERS[spec.provider]
  let mod: Record<string, unknown>
  try {
    mod = await (options.importer ?? defaultImporter)(desc.pkg)
  } catch (error) {
    throw new HarnessError(
      `Model "${spec.provider}/${spec.model}" needs the optional package ${desc.pkg}. Install it with: pnpm add ${desc.pkg} -w  (and make sure \`${desc.cli}\` is installed and logged in: ${desc.loginCommand}). Cause: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  const factory = mod[desc.factory]
  if (typeof factory !== 'function') {
    throw new HarnessError(`${desc.pkg} does not export ${desc.factory}()`)
  }
  const provider = (factory as (settings?: Record<string, unknown>) => unknown)(
    options.settings ?? {},
  )
  if (typeof provider !== 'function') {
    throw new HarnessError(`${desc.pkg}.${desc.factory}() did not return a provider function`)
  }
  const model = (provider as (id: string) => unknown)(spec.model || desc.defaultModel)
  if (!isLanguageModelLike(model)) {
    throw new HarnessError(`${desc.pkg} returned something that is not an AI SDK language model`)
  }
  return model
}

import { Agent } from '@mastra/core/agent'
import { type Env, parseModelSpec, resolveModel } from '@xdc-ai/models'

export interface SmokeResult {
  ok: boolean
  text?: string
  ms: number
  error?: string
}

/** One tiny round-trip through Mastra with the chosen model, bounded by a timeout. */
export async function smokeTest(spec: string, env: Env, timeoutMs = 45_000): Promise<SmokeResult> {
  const started = Date.now()
  try {
    const model = await resolveModel(parseModelSpec(spec), env)
    const agent = new Agent({
      id: 'smoke',
      name: 'smoke',
      instructions: 'You are a connectivity check. Reply with exactly one word.',
      model: model as never,
    })
    const result = await Promise.race([
      agent.generate('Reply with the single word: pong'),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`no reply within ${timeoutMs / 1000}s`)), timeoutMs),
      ),
    ])
    const text = (result as { text?: string }).text?.trim() ?? ''
    return { ok: text.length > 0, text, ms: Date.now() - started }
  } catch (error) {
    return {
      ok: false,
      ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

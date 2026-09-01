import {
  isHarnessProvider,
  type LanguageModelLike,
  loadHarnessModel,
  type LoadHarnessOptions,
} from './harness.ts'
import { type Env, type MastraModel, type ModelSpec, toMastraModel } from './spec.ts'

export type ResolvedModel = MastraModel | LanguageModelLike

/** One entry point for the agent: harness providers become model instances, everything else a router id. */
export async function resolveModel(
  spec: ModelSpec,
  env: Env,
  harness: LoadHarnessOptions = {},
): Promise<ResolvedModel> {
  if (isHarnessProvider(spec.provider)) return loadHarnessModel(spec, harness)
  return toMastraModel(spec, env)
}

export function describeModel(spec: ModelSpec): string {
  return spec.url
    ? `${spec.provider}/${spec.model} @ ${spec.url}`
    : `${spec.provider}/${spec.model}`
}

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { createTool } from '@mastra/core/tools'
import { LocalSandbox } from '@mastra/core/workspace'
import { z } from 'zod'

import { classifyCommand, clipOutput } from './commands.ts'

export type SandboxMode = 'off' | 'local'

export function sandboxMode(env: Readonly<Record<string, string | undefined>>): SandboxMode {
  return env.SANDBOX?.trim().toLowerCase() === 'local' ? 'local' : 'off'
}

/** Strongest native isolation available on this host: Seatbelt on macOS, Bubblewrap on Linux, otherwise none (and we say so). */
export function isolationFor(
  platform: NodeJS.Platform = process.platform,
): 'seatbelt' | 'bwrap' | 'none' {
  if (platform === 'darwin') return 'seatbelt'
  if (platform === 'linux') return 'bwrap'
  return 'none'
}

export interface SandboxOptions {
  dataDir: string
  allowNetwork?: boolean
  timeoutMs?: number
}

export type Isolation = ReturnType<typeof isolationFor>

/**
 * Builds the sandbox with the strongest isolation the host supports. If the native backend is missing
 * (e.g. Linux without bubblewrap) it falls back to an unisolated scratch directory and says so loudly —
 * the command deny list and the scratch dir still apply, the kernel boundary does not.
 */
export function createLocalSandbox(
  options: SandboxOptions,
  preferred: Isolation = isolationFor(),
): { sandbox: LocalSandbox; dir: string; isolation: Isolation; fallbackReason?: string } {
  const dir = join(options.dataDir, 'sandbox')
  mkdirSync(dir, { recursive: true })
  const build = (isolation: Isolation): LocalSandbox =>
    new LocalSandbox({
      id: 'kit-sandbox',
      workingDirectory: dir,
      isolation,
      nativeSandbox: {
        allowNetwork: options.allowNetwork ?? false,
        readWritePaths: [dir],
        allowSystemBinaries: true,
      },
      timeout: options.timeoutMs ?? 60_000,
    })
  try {
    return { sandbox: build(preferred), dir, isolation: preferred }
  } catch (error) {
    if (preferred === 'none') throw error
    const reason = error instanceof Error ? error.message : String(error)
    console.warn(
      `[sandbox] ${preferred} isolation unavailable (${reason.split('\n')[0]}); running commands WITHOUT kernel isolation`,
    )
    return { sandbox: build('none'), dir, isolation: 'none', fallbackReason: reason }
  }
}

export interface RunResult {
  ok: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  denied?: string
  isolation: string
}

/** Runs one shell command in the sandbox with the command policy applied first. */
export async function runInSandbox(
  sandbox: LocalSandbox,
  isolation: string,
  command: string,
  timeoutMs = 60_000,
): Promise<RunResult> {
  const verdict = classifyCommand(command)
  if (!verdict.ok)
    return { ok: false, exitCode: null, stdout: '', stderr: '', denied: verdict.reason, isolation }
  await sandbox.ensureRunning()
  const processes = sandbox.processes
  if (!processes) throw new Error('sandbox has no process manager')
  let stdout = ''
  let stderr = ''
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const handle = await processes.spawn(command, {
      onStdout: (d: string) => {
        stdout += d
      },
      onStderr: (d: string) => {
        stderr += d
      },
    })
    const result = (await handle.wait({ abortSignal: controller.signal })) as {
      exitCode?: number | null
      stdout?: string
      stderr?: string
    }
    if (!stdout && result.stdout) stdout = result.stdout
    if (!stderr && result.stderr) stderr = result.stderr
    const exitCode = result.exitCode ?? null
    return {
      ok: exitCode === 0,
      exitCode,
      stdout: clipOutput(stdout),
      stderr: clipOutput(stderr),
      isolation,
    }
  } finally {
    clearTimeout(timer)
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- Mastra infers the Tool generics
export function createSandboxTools(options: SandboxOptions) {
  const { sandbox, dir, isolation, fallbackReason } = createLocalSandbox(options)
  const runCommand = createTool({
    id: 'run_command',
    description:
      `Run a shell command in a scratch sandbox (${isolation === 'none' ? 'NO kernel isolation on this host' : `${isolation} isolation`}, working dir ${dir}, network ${options.allowNetwork ? 'allowed' : 'blocked'}). ` +
      'Use it for calculations, data wrangling, scripts and file processing. Destructive or exfiltrating commands are refused; ask the human for those. Output is truncated.',
    inputSchema: z.object({
      command: z.string().describe('POSIX shell command line'),
      timeoutSeconds: z.number().int().min(1).max(300).optional(),
    }),
    outputSchema: z.object({
      ok: z.boolean(),
      exitCode: z.number().nullable(),
      stdout: z.string(),
      stderr: z.string(),
      denied: z.string().optional(),
      isolation: z.string(),
    }),
    execute: async ({ command, timeoutSeconds }) =>
      runInSandbox(sandbox, isolation, command, (timeoutSeconds ?? 60) * 1000),
  })
  return {
    tools: { run_command: runCommand },
    isolation,
    dir,
    ...(fallbackReason ? { fallbackReason } : {}),
  }
}

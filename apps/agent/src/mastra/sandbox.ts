import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { createTool } from '@mastra/core/tools'
import { LocalSandbox } from '@mastra/core/workspace'
import { z } from 'zod'

import { classifyCommand, clipOutput } from './commands.ts'

export type SandboxMode = 'off' | 'local'

/** ON by default — an unset SANDBOX (e.g. a .env written by an older wizard) must not silently remove tools. */
export function sandboxMode(env: Readonly<Record<string, string | undefined>>): SandboxMode {
  const v = env.SANDBOX?.trim().toLowerCase()
  return v === 'off' || v === 'none' || v === '0' || v === 'false' ? 'off' : 'local'
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
  /** Extra read-write mounts (human-granted folders); re-read every run so revokes apply immediately. */
  extraPaths?: (() => string[]) | undefined
  readWritePaths?: string[] | undefined
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
        readWritePaths: [dir, ...(options.readWritePaths ?? [])],
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

const BACKEND_FAILURE =
  /bwrap:|sandbox-exec:|unshare|user namespaces?|setting up uid map|Operation not permitted|No permissions to create new namespace|loopback|seatbelt/i

/**
 * Owns the sandbox for the process. The first real command doubles as a probe: if the isolation backend
 * itself cannot start (GitHub runners, locked-down containers, Macs with unusual policies), the runner
 * rebuilds without kernel isolation, warns once, and continues — the deny list and scratch dir still apply.
 */
export class SandboxRunner {
  private sandbox: LocalSandbox
  isolation: Isolation
  readonly dir: string
  fallbackReason: string | undefined
  private probed = false
  private extrasKey = ''
  private readonly options: SandboxOptions

  constructor(options: SandboxOptions) {
    this.options = options
    const built = createLocalSandbox(options)
    this.sandbox = built.sandbox
    this.isolation = built.isolation
    this.dir = built.dir
    this.fallbackReason = built.fallbackReason
  }

  async run(command: string, timeoutMs = 60_000): Promise<RunResult> {
    const verdict = classifyCommand(command)
    if (!verdict.ok)
      return {
        ok: false,
        exitCode: null,
        stdout: '',
        stderr: '',
        denied: verdict.reason,
        isolation: this.isolation,
      }
    const extras = this.options.extraPaths?.() ?? []
    const key = [...extras].sort().join('\u0000')
    if (key !== this.extrasKey) {
      this.extrasKey = key
      await this.sandbox.destroy().catch(() => undefined)
      this.sandbox = createLocalSandbox(
        { ...this.options, readWritePaths: extras },
        this.isolation,
      ).sandbox
    }
    if (!this.probed) {
      this.probed = true
      if (this.isolation !== 'none') {
        const probe = await this.exec('echo __kit_probe__', 15_000).catch((e: unknown) => ({
          ok: false,
          exitCode: null,
          stdout: '',
          stderr: e instanceof Error ? e.message : String(e),
          isolation: this.isolation,
        }))
        if (!probe.ok || !probe.stdout.includes('__kit_probe__')) {
          if (BACKEND_FAILURE.test(probe.stderr) || probe.exitCode !== 0) {
            const reason = probe.stderr.trim().split('\n')[0] || `probe exited ${probe.exitCode}`
            console.warn(
              `[sandbox] ${this.isolation} isolation cannot start here (${reason}); running commands WITHOUT kernel isolation`,
            )
            await this.sandbox.destroy().catch(() => undefined)
            this.sandbox = createLocalSandbox(this.options, 'none').sandbox
            this.isolation = 'none'
            this.fallbackReason = reason
          }
        }
      }
    }
    return this.exec(command, timeoutMs)
  }

  private async exec(command: string, timeoutMs: number): Promise<RunResult> {
    await this.sandbox.ensureRunning()
    const processes = this.sandbox.processes
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
        isolation: this.isolation,
      }
    } finally {
      clearTimeout(timer)
    }
  }

  destroy(): Promise<void> {
    return this.sandbox.destroy()
  }
}

/** Convenience for one-off use (tests, scripts). */
export async function runInSandbox(
  runner: SandboxRunner,
  command: string,
  timeoutMs = 60_000,
): Promise<RunResult> {
  return runner.run(command, timeoutMs)
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- Mastra infers the Tool generics
export function createSandboxTools(options: SandboxOptions) {
  const runner = new SandboxRunner(options)
  const runCommand = createTool({
    id: 'run_command',
    description:
      `Run a shell command in a scratch sandbox (working dir ${runner.dir}, network ${options.allowNetwork ? 'allowed' : 'blocked'}; isolation is reported in each result). ` +
      'Folders the human has granted (folder_list) are mounted read-write. Use it for calculations, data wrangling, scripts and file processing. Destructive or exfiltrating commands are refused; ask the human for those. Output is truncated.',
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
      runner.run(command, (timeoutSeconds ?? 60) * 1000),
  })
  return {
    tools: { run_command: runCommand },
    runner,
    get isolation() {
      return runner.isolation
    },
    dir: runner.dir,
  }
}

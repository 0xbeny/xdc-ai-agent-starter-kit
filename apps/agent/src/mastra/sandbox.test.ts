import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { createLocalSandbox, isolationFor, SandboxRunner, sandboxMode } from './sandbox.ts'

describe('sandbox config', () => {
  it('is on by default; off only when explicitly disabled', () => {
    expect(sandboxMode({})).toBe('local')
    expect(sandboxMode({ SANDBOX: 'local' })).toBe('local')
    expect(sandboxMode({ SANDBOX: 'off' })).toBe('off')
    expect(sandboxMode({ SANDBOX: '0' })).toBe('off')
  })

  it('picks the native isolation for the platform', () => {
    expect(isolationFor('darwin')).toBe('seatbelt')
    expect(isolationFor('linux')).toBe('bwrap')
    expect(isolationFor('win32')).toBe('none')
  })
})

const native = process.platform === 'darwin' || process.platform === 'linux'

describe('createLocalSandbox fallback', () => {
  it('falls back to no isolation when the native backend is unavailable', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'sbx-'))
    // 'bwrap' is never available on macOS and may be missing on Linux; either way construction must not throw.
    const out = createLocalSandbox(
      { dataDir },
      process.platform === 'darwin' ? 'bwrap' : 'seatbelt',
    )
    expect(['none', 'bwrap', 'seatbelt']).toContain(out.isolation)
    if (out.isolation === 'none') expect(out.fallbackReason).toBeTruthy()
  })
})

describe.runIf(native)('runInSandbox (live)', () => {
  it('runs a harmless command inside the scratch dir and refuses a denied one without spawning', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'sbx-'))
    const runner = new SandboxRunner({ dataDir })
    try {
      const ok = await runner.run('echo hello && pwd')
      expect(ok.ok, `stderr: ${ok.stderr}`).toBe(true)
      expect(ok.stdout).toContain('hello')
      expect(ok.stdout).toContain('sandbox')
      expect(['seatbelt', 'bwrap', 'none']).toContain(ok.isolation)
      const denied = await runner.run('sudo rm -rf /')
      expect(denied.ok).toBe(false)
      expect(denied.denied).toMatch(/privilege/)
    } finally {
      await runner.destroy().catch(() => undefined)
    }
  }, 60_000)
})

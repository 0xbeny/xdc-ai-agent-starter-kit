import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { createLocalSandbox, isolationFor, runInSandbox, sandboxMode } from './sandbox.ts'

describe('sandbox config', () => {
  it('is off unless SANDBOX=local', () => {
    expect(sandboxMode({})).toBe('off')
    expect(sandboxMode({ SANDBOX: 'local' })).toBe('local')
  })

  it('picks the native isolation for the platform', () => {
    expect(isolationFor('darwin')).toBe('seatbelt')
    expect(isolationFor('linux')).toBe('bwrap')
    expect(isolationFor('win32')).toBe('none')
  })
})

const native = process.platform === 'darwin' || process.platform === 'linux'

describe.runIf(native)('runInSandbox (live, native isolation)', () => {
  it('runs a harmless command inside the scratch dir and refuses a denied one without spawning', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'sbx-'))
    const { sandbox, isolation } = createLocalSandbox({ dataDir })
    try {
      const ok = await runInSandbox(sandbox, isolation, 'echo hello && pwd')
      expect(ok.ok).toBe(true)
      expect(ok.stdout).toContain('hello')
      expect(ok.stdout).toContain('sandbox')
      const denied = await runInSandbox(sandbox, isolation, 'sudo rm -rf /')
      expect(denied.ok).toBe(false)
      expect(denied.denied).toMatch(/privilege/)
    } finally {
      await sandbox.destroy().catch(() => undefined)
    }
  }, 60_000)
})

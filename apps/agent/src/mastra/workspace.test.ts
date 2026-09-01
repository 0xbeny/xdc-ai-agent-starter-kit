import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { loadInstructions } from './workspace.ts'

describe('loadInstructions', () => {
  it('returns a safe default when the workspace is empty', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ws-'))
    expect(loadInstructions(dir)).toMatch(/helpful/)
  })

  it('injects SOUL.md before AGENTS.md', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ws-'))
    writeFileSync(join(dir, 'AGENTS.md'), '# Procedures\nAsk before paying.')
    writeFileSync(join(dir, 'SOUL.md'), '# Soul\nBe direct.')
    const text = loadInstructions(dir)
    expect(text.indexOf('Be direct.')).toBeLessThan(text.indexOf('Ask before paying.'))
  })

  it('skips files that are empty', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ws-'))
    writeFileSync(join(dir, 'SOUL.md'), '   \n')
    writeFileSync(join(dir, 'AGENTS.md'), 'Only this.')
    expect(loadInstructions(dir)).toBe('Only this.')
  })
})

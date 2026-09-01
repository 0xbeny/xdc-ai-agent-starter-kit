import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { loadWorkspace } from './load.ts'

function ws(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'ws-'))
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true })
    writeFileSync(join(dir, name), text)
  }
  return dir
}

describe('loadWorkspace', () => {
  it('falls back to a default prompt for an empty workspace', () => {
    const out = loadWorkspace(ws())
    expect(out.files).toEqual([])
    expect(out.prompt).toMatch(/helpful/)
    expect(out.missing).toEqual(['SOUL.md', 'IDENTITY.md', 'USER.md', 'AGENTS.md', 'MEMORY.md'])
  })

  it('injects in the canonical order with SOUL verbatim first', () => {
    const dir = ws({
      'MEMORY.md': '- m',
      'AGENTS.md': 'agents',
      'USER.md': 'user',
      'IDENTITY.md': 'identity',
      'SOUL.md': 'SOUL TEXT',
    })
    const out = loadWorkspace(dir)
    expect(out.files.map((f) => f.name)).toEqual([
      'SOUL.md',
      'IDENTITY.md',
      'USER.md',
      'AGENTS.md',
      'MEMORY.md',
    ])
    expect(out.prompt.startsWith('SOUL TEXT')).toBe(true)
    expect(out.prompt.indexOf('<file name="USER.md">')).toBeLessThan(
      out.prompt.indexOf('<file name="AGENTS.md">'),
    )
    expect(out.bootstrap).toBe(false)
  })

  it('includes BOOTSTRAP.md only when present and flags it', () => {
    const out = loadWorkspace(ws({ 'SOUL.md': 's', 'BOOTSTRAP.md': 'first run' }))
    expect(out.bootstrap).toBe(true)
    expect(out.prompt).toContain('<file name="BOOTSTRAP.md">')
    expect(out.missing).not.toContain('BOOTSTRAP.md')
  })

  it('applies per-file budgets and reports truncation', () => {
    const out = loadWorkspace(ws({ 'SOUL.md': 'x'.repeat(10_000) }), {
      budgets: { 'SOUL.md': 1000 },
    })
    const soul = out.files[0]
    expect(soul?.truncated).toBe(true)
    expect(soul?.chars).toBeLessThan(1100)
  })

  it('never exceeds the total budget across files', () => {
    const dir = ws({
      'SOUL.md': 'a'.repeat(5000),
      'AGENTS.md': 'b'.repeat(5000),
      'USER.md': 'c'.repeat(3000),
    })
    const out = loadWorkspace(dir, { totalBudget: 6000 })
    expect(out.totalChars).toBeLessThanOrEqual(6000)
    expect(out.prompt.length).toBeLessThanOrEqual(6000 + 400) // tags and headings only
    expect(out.files.find((f) => f.name === 'USER.md')?.truncated).toBe(true)
    expect(out.omitted).toEqual(['AGENTS.md'])
  })

  it('loads today and yesterday daily logs only', () => {
    const now = new Date('2026-09-01T12:00:00Z')
    const dir = ws({
      'SOUL.md': 's',
      'memory/2026-09-01.md': '- today',
      'memory/2026-08-31.md': '- yesterday',
      'memory/2026-08-30.md': '- older',
    })
    const out = loadWorkspace(dir, { now })
    const names = out.files.map((f) => f.name)
    expect(names).toContain('memory/2026-09-01.md')
    expect(names).toContain('memory/2026-08-31.md')
    expect(names).not.toContain('memory/2026-08-30.md')
  })

  it('lists optional files that are not written yet inside the prompt', () => {
    const out = loadWorkspace(ws({ 'SOUL.md': 's', 'AGENTS.md': 'a' }))
    expect(out.prompt).toContain(
      '<missing>IDENTITY.md, USER.md, MEMORY.md not written yet</missing>',
    )
  })
})

import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { addMissingFromTemplates, ensureWorkspace } from './seed.ts'

function templates(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tpl-'))
  writeFileSync(join(dir, 'SOUL.md'), 'default soul')
  writeFileSync(join(dir, 'AGENTS.md'), 'default agents')
  writeFileSync(join(dir, 'BOOTSTRAP.md'), 'first run')
  mkdirSync(join(dir, 'skills'))
  writeFileSync(join(dir, 'skills', 'README.md'), 'skills')
  return dir
}

describe('ensureWorkspace', () => {
  it('seeds an empty workspace from templates', () => {
    const ws = join(mkdtempSync(join(tmpdir(), 'ws-')), 'workspace')
    const out = ensureWorkspace(ws, templates())
    expect(out.seeded).toBe(true)
    expect(readFileSync(join(ws, 'SOUL.md'), 'utf8')).toBe('default soul')
    expect(existsSync(join(ws, 'skills', 'README.md'))).toBe(true)
  })

  it('never overwrites an existing workspace', () => {
    const ws = mkdtempSync(join(tmpdir(), 'ws-'))
    writeFileSync(join(ws, 'SOUL.md'), 'mine')
    const out = ensureWorkspace(ws, templates())
    expect(out.seeded).toBe(false)
    expect(readFileSync(join(ws, 'SOUL.md'), 'utf8')).toBe('mine')
    expect(existsSync(join(ws, 'AGENTS.md'))).toBe(false)
  })
})

describe('addMissingFromTemplates', () => {
  it('adds new template files but skips edited ones and BOOTSTRAP', () => {
    const ws = mkdtempSync(join(tmpdir(), 'ws-'))
    writeFileSync(join(ws, 'SOUL.md'), 'mine')
    const added = addMissingFromTemplates(ws, templates())
    expect(added.sort()).toEqual(['AGENTS.md', 'skills/README.md'])
    expect(readFileSync(join(ws, 'SOUL.md'), 'utf8')).toBe('mine')
    expect(existsSync(join(ws, 'BOOTSTRAP.md'))).toBe(false)
  })

  it('delivers new bundled skills per directory without touching existing ones', () => {
    const tpl = templates()
    mkdirSync(join(tpl, 'skills', 'productivity', 'docx'), { recursive: true })
    writeFileSync(join(tpl, 'skills', 'productivity', 'docx', 'SKILL.md'), 'v2')
    mkdirSync(join(tpl, 'skills', 'productivity', 'pdf'), { recursive: true })
    writeFileSync(join(tpl, 'skills', 'productivity', 'pdf', 'SKILL.md'), 'pdf')
    const ws = mkdtempSync(join(tmpdir(), 'ws-'))
    mkdirSync(join(ws, 'skills', 'productivity', 'docx'), { recursive: true })
    writeFileSync(join(ws, 'skills', 'productivity', 'docx', 'SKILL.md'), 'my edited docx')
    const added = addMissingFromTemplates(ws, tpl)
    expect(added).toContain('skills/productivity/pdf')
    expect(added).not.toContain('skills/productivity/docx')
    expect(readFileSync(join(ws, 'skills', 'productivity', 'docx', 'SKILL.md'), 'utf8')).toBe(
      'my edited docx',
    )
    expect(existsSync(join(ws, 'skills', 'productivity', 'pdf', 'SKILL.md'))).toBe(true)
  })
})

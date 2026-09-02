import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ImproveError, MAX_DOC_CHARS, writeSkill, writeSoulDoc } from './improve.ts'
import { listSkills } from './skills.ts'

const SKILL = `---
name: greet
description: Say hello properly
---

# Greet

Say hello.
`

describe('writeSkill', () => {
  it('creates a listable skill and reports updates', () => {
    const ws = mkdtempSync(join(tmpdir(), 'improve-'))
    expect(writeSkill(ws, 'ops', 'greet', SKILL).action).toBe('created')
    expect(listSkills(ws).map((s) => s.name)).toContain('greet')
    expect(writeSkill(ws, 'ops', 'greet', SKILL).action).toBe('updated')
  })
  it('rejects bad slugs, traversal, and missing frontmatter', () => {
    const ws = mkdtempSync(join(tmpdir(), 'improve-'))
    expect(() => writeSkill(ws, '../etc', 'greet', SKILL)).toThrow(ImproveError)
    expect(() => writeSkill(ws, 'ops', 'Greet', SKILL)).toThrow(ImproveError)
    expect(() => writeSkill(ws, 'ops', 'other', SKILL)).toThrow(/must equal "other"/)
    expect(() => writeSkill(ws, 'ops', 'greet', '# no frontmatter')).toThrow(/description|name/)
  })
})

describe('writeSoulDoc', () => {
  it('writes only the allowlisted files, never blanks, caps size', () => {
    const ws = mkdtempSync(join(tmpdir(), 'improve-'))
    writeFileSync(join(ws, 'USER.md'), 'old')
    const r = writeSoulDoc(ws, 'USER.md', '# User\nLikes teal.')
    expect(r.previousChars).toBe(3)
    expect(readFileSync(r.path, 'utf8')).toContain('teal')
    expect(() => writeSoulDoc(ws, 'MEMORY.md', 'x')).toThrow(ImproveError)
    expect(() => writeSoulDoc(ws, '../SOUL.md', 'x')).toThrow(ImproveError)
    expect(() => writeSoulDoc(ws, 'SOUL.md', '  ')).toThrow(/blanked/)
    expect(() => writeSoulDoc(ws, 'SOUL.md', 'x'.repeat(MAX_DOC_CHARS + 1))).toThrow(/max/)
  })
})

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { listSkills, SkillError, viewSkill } from './skills.ts'

function ws(): string {
  const dir = mkdtempSync(join(tmpdir(), 'skills-'))
  const a = join(dir, 'skills', 'ops', 'deploy')
  mkdirSync(a, { recursive: true })
  writeFileSync(
    join(a, 'SKILL.md'),
    '---\nname: deploy\ndescription: Ship to prod\nversion: 1.2.0\n---\n# Deploy\n1. build',
  )
  mkdirSync(join(a, 'references'))
  writeFileSync(join(a, 'references', 'checklist.md'), 'check')
  const b = join(dir, 'skills', 'finance', 'reconcile')
  mkdirSync(b, { recursive: true })
  writeFileSync(join(b, 'SKILL.md'), 'no frontmatter here')
  return dir
}

describe('listSkills', () => {
  it('returns an empty list when there is no skills directory', () => {
    expect(listSkills(mkdtempSync(join(tmpdir(), 'empty-')))).toEqual([])
  })

  it('reads frontmatter and falls back to the directory name', () => {
    const skills = listSkills(ws())
    expect(skills.map((s) => s.name)).toEqual(['deploy', 'reconcile'])
    expect(skills[0]).toMatchObject({
      description: 'Ship to prod',
      category: 'ops',
      version: '1.2.0',
    })
    expect(skills[1]).toMatchObject({ description: '', category: 'finance' })
  })
})

describe('viewSkill', () => {
  it('returns SKILL.md by default and nested files by path', () => {
    const dir = ws()
    expect(viewSkill(dir, 'deploy')).toContain('# Deploy')
    expect(viewSkill(dir, 'deploy', 'references/checklist.md')).toBe('check')
  })

  it('rejects unknown skills, missing files and path traversal', () => {
    const dir = ws()
    expect(() => viewSkill(dir, 'nope')).toThrow(SkillError)
    expect(() => viewSkill(dir, 'deploy', 'missing.md')).toThrow(SkillError)
    expect(() => viewSkill(dir, 'deploy', '../../SOUL.md')).toThrow(/inside the skill/)
    expect(() => viewSkill(dir, 'deploy', '/etc/passwd')).toThrow(/inside the skill/)
  })
})

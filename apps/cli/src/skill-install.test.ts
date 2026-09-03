import { createServer } from 'node:http'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { installSkill, rawSkillUrl } from './skill-install.ts'

const SKILL = `---
name: standup-notes
description: Summarise yesterday and today into standup notes
---

# Standup notes
`

const server = createServer((req, res) => {
  if (req.url === '/skills/x/SKILL.md') res.end(SKILL)
  else if (req.url === '/bare') res.end('no frontmatter here')
  else {
    res.writeHead(404)
    res.end()
  }
})
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
afterAll(() => server.close())

describe('rawSkillUrl', () => {
  it('normalises GitHub folder/blob links to the raw SKILL.md', () => {
    expect(rawSkillUrl('https://github.com/o/r/tree/main/skills/ops/standup')).toBe(
      'https://raw.githubusercontent.com/o/r/main/skills/ops/standup/SKILL.md',
    )
    expect(rawSkillUrl('https://github.com/o/r/blob/main/x/SKILL.md')).toBe(
      'https://raw.githubusercontent.com/o/r/main/x/SKILL.md',
    )
    expect(rawSkillUrl('https://example.com/skill/')).toBe('https://example.com/skill/SKILL.md')
    expect(() => rawSkillUrl('ftp://x')).toThrow()
    expect(() => rawSkillUrl('https://github.com/o/r')).toThrow(/tree|blob/)
  })
})

describe('installSkill', () => {
  it('fetches, requires confirmation, writes the skill + provenance', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'skillinst-'))
    const seen: string[] = []
    const denied = await installSkill(
      { workspaceDir: ws, confirm: async () => false },
      `${base}/skills/x`,
    )
    expect(denied.ok).toBe(false)
    expect(denied.message).toMatch(/cancelled/)

    const r = await installSkill(
      {
        workspaceDir: ws,
        confirm: async (meta, content) => {
          seen.push(meta.name, meta.category)
          return content.includes('Standup')
        },
      },
      `${base}/skills/x`,
    )
    expect(r.ok).toBe(true)
    expect(seen).toEqual(['standup-notes', 'community'])
    expect(existsSync(r.path as string)).toBe(true)
    const src = JSON.parse(
      readFileSync(join(ws, 'skills', 'community', 'standup-notes', '.source.json'), 'utf8'),
    ) as { sha256: string; url: string }
    expect(src.sha256).toHaveLength(64)
  })
  it('rejects non-skills and bad responses', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'skillinst-'))
    const deps = { workspaceDir: ws, confirm: async () => true }
    expect((await installSkill(deps, `${base}/nope`)).message).toMatch(/HTTP 404/)
  })
})

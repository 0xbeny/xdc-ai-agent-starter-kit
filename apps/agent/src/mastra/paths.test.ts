import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { findRepoRoot, resolveFromRoot } from './paths.ts'

function fakeRepo(): { root: string; nested: string } {
  const root = mkdtempSync(join(tmpdir(), 'repo-'))
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n')
  const nested = join(root, 'apps', 'agent')
  mkdirSync(nested, { recursive: true })
  return { root, nested }
}

describe('findRepoRoot', () => {
  it('walks up to the directory containing pnpm-workspace.yaml', () => {
    const { root, nested } = fakeRepo()
    expect(findRepoRoot(nested)).toBe(root)
  })

  it('returns null when no marker exists', () => {
    const lonely = mkdtempSync(join(tmpdir(), 'lonely-'))
    expect(findRepoRoot(lonely)).toBeNull()
  })
})

describe('resolveFromRoot', () => {
  it('resolves relative paths against the repo root, not the cwd', () => {
    const { root, nested } = fakeRepo()
    expect(resolveFromRoot('./workspace', nested)).toBe(join(root, 'workspace'))
  })

  it('leaves absolute paths alone', () => {
    const { nested } = fakeRepo()
    expect(resolveFromRoot('/srv/agent/workspace', nested)).toBe('/srv/agent/workspace')
  })

  it('falls back to the start directory when there is no repo root', () => {
    const lonely = mkdtempSync(join(tmpdir(), 'lonely-'))
    expect(resolveFromRoot('./data', lonely)).toBe(resolve(lonely, 'data'))
  })
})

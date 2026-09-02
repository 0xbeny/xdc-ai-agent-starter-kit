import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { JsonlApprovalStore } from '@xdc-ai/xdcai'
import { describe, expect, it } from 'vitest'

import { forbiddenGrant, GrantStore, runFolderRequest } from './grants.ts'

function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'grants-home-'))
  const kitRoot = join(home, 'xdc-ai-agent-starter-kit')
  const ok = join(home, 'Projects', 'reports')
  for (const d of [kitRoot, ok, join(home, '.ssh')]) mkdirSync(d, { recursive: true })
  return { home, kitRoot, ok }
}

describe('forbiddenGrant — the floor approval cannot override', () => {
  const { home, kitRoot, ok } = fixture()
  const ctx = { home, protectedRoots: [kitRoot] }
  it('allows a plain existing project folder', () => {
    expect(forbiddenGrant(ok, ctx)).toBeUndefined()
  })
  it.each([
    ['relative', 'Projects/reports'],
    ['root', '/'],
    ['system', '/etc'],
    ['home itself', home],
    ['above home', join(home, '..')],
    ['ssh', join(home, '.ssh')],
    ['inside kit', join(kitRoot, 'data')],
    ['parent of kit', home],
    ['missing dir', join(home, 'nope')],
  ])('denies %s', (_label, path) => {
    expect(forbiddenGrant(path, ctx)).toBeTruthy()
  })
})

describe('GrantStore', () => {
  it('adds (deduped by path), lists, revokes by prefix', () => {
    const { ok } = fixture()
    const store = new GrantStore(join(mkdtempSync(join(tmpdir(), 'grants-')), 'grants.json'))
    store.add(ok, 'first')
    const g = store.add(ok, 'again')
    expect(store.list()).toHaveLength(1)
    expect(store.paths()).toEqual([ok])
    expect(store.revoke(g.id.slice(0, 8)).path).toBe(ok)
    expect(store.list()).toHaveLength(0)
    expect(() => store.revoke('nah')).toThrow(/no grant/)
  })
})

describe('folder_request approval flow', () => {
  it('parks, applies once approved, and never creates approvals for forbidden paths', async () => {
    const { home, kitRoot, ok } = fixture()
    const dir = mkdtempSync(join(tmpdir(), 'grants-deps-'))
    const deps = {
      grants: new GrantStore(join(dir, 'grants.json')),
      approvals: new JsonlApprovalStore(join(dir, 'approvals.jsonl')),
      workspaceDir: dir,
      protectedRoots: [kitRoot],
      home,
    }
    const bad = await runFolderRequest(deps, { path: join(home, '.ssh'), reason: 'keys' })
    expect(bad.ok).toBe(false)
    expect(bad.message).toMatch(/never grantable/)
    expect(await deps.approvals.list()).toHaveLength(0)

    const parked = await runFolderRequest(deps, { path: ok, reason: 'summarize reports' })
    expect(parked.ok).toBe(false)
    expect(parked.approvalId).toBeTruthy()
    await deps.approvals.decide(parked.approvalId as string, 'approved')
    const applied = await runFolderRequest(deps, {
      path: ok,
      reason: 'summarize reports',
      approvalId: parked.approvalId,
    })
    expect(applied.ok).toBe(true)
    expect(deps.grants.paths()).toEqual([ok])
  })
})

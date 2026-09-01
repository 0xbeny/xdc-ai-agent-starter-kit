import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { AccessControl, parseIdList } from './access.ts'

const mk = (opts: Partial<ConstructorParameters<typeof AccessControl>[0]> = {}) =>
  new AccessControl({ path: join(mkdtempSync(join(tmpdir(), 'acl-')), 'telegram.json'), ...opts })

describe('AccessControl', () => {
  it('denies unknown users by default and honours env allowlists', () => {
    const acl = mk({ adminIds: ['1'], userIds: ['2'] })
    expect(acl.isAllowed('999')).toBe(false)
    expect(acl.isAdmin('1')).toBe(true)
    expect(acl.roleOf('2')).toBe('user')
    expect(acl.adminIds()).toEqual(['1'])
  })

  it('pairs the first user as admin, later users as user, and burns the code', () => {
    let t = 1_000_000
    const acl = mk({ now: () => t })
    const code = acl.pairingCode()
    expect(code).toMatch(/^\d{6}$/)
    expect(acl.pairingCode()).toBe(code)
    expect(acl.pair('10', 'nope')).toBeNull()
    expect(acl.pair('10', code, 'Beny')).toBe('admin')
    expect(acl.pair('11', code)).toBeNull() // single use
    const code2 = acl.pairingCode()
    expect(code2).not.toBe(code)
    expect(acl.pair('11', code2)).toBe('user')
    expect(acl.adminIds()).toEqual(['10'])
    t += 11 * 60 * 1000
    const code3 = acl.pairingCode()
    t += 11 * 60 * 1000
    expect(acl.pair('12', code3)).toBeNull() // expired
  })

  it('revokes paired users but not env ones', () => {
    const acl = mk({ adminIds: ['1'] })
    const code = acl.pairingCode()
    acl.pair('5', code)
    expect(acl.isAllowed('5')).toBe(true)
    expect(acl.revoke('5')).toBe(true)
    expect(acl.isAllowed('5')).toBe(false)
    expect(acl.revoke('1')).toBe(false)
    expect(acl.isAdmin('1')).toBe(true)
  })
})

describe('parseIdList', () => {
  it('splits and trims', () => {
    expect(parseIdList(' 1, 2 ,,3')).toEqual(['1', '2', '3'])
    expect(parseIdList(undefined)).toEqual([])
  })
})

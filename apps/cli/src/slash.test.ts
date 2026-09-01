import { describe, expect, it } from 'vitest'

import { matchApprovalId, parseSlash } from './slash.ts'

describe('parseSlash', () => {
  it('treats plain text as a message', () => {
    expect(parseSlash('  hello there ')).toEqual({ kind: 'message', text: 'hello there' })
  })
  it('parses commands and aliases', () => {
    expect(parseSlash('/new')).toEqual({ kind: 'new' })
    expect(parseSlash('/approve abcd1234')).toEqual({ kind: 'approve', id: 'abcd1234' })
    expect(parseSlash('/deny abcd1234')).toEqual({ kind: 'deny', id: 'abcd1234' })
    expect(parseSlash('/q')).toEqual({ kind: 'quit' })
    expect(parseSlash('/approve')).toEqual({ kind: 'unknown', text: '/approve' })
    expect(parseSlash('/nope')).toEqual({ kind: 'unknown', text: '/nope' })
  })
})

describe('matchApprovalId', () => {
  const items = [{ id: 'abcd1234-1' }, { id: 'abcd9999-2' }, { id: 'zzzz0000-3' }]
  it('matches exact or unique prefix only', () => {
    expect(matchApprovalId(items, 'zzzz0000-3')?.id).toBe('zzzz0000-3')
    expect(matchApprovalId(items, 'zzzz')?.id).toBe('zzzz0000-3')
    expect(matchApprovalId(items, 'abcd')).toBeUndefined()
    expect(matchApprovalId(items, 'abcd12')?.id).toBe('abcd1234-1')
  })
})

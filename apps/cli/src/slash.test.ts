import { describe, expect, it } from 'vitest'

import { completeSlash, matchApprovalId, parseSlash, slashHelpLines } from './slash.ts'

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
    expect(parseSlash('/model xai/grok-4.3')).toEqual({ kind: 'model', spec: 'xai/grok-4.3' })
    expect(parseSlash('/model')).toEqual({ kind: 'model' })
    expect(parseSlash('/skill docx')).toEqual({ kind: 'skill', name: 'docx' })
    expect(parseSlash('/cron')).toEqual({ kind: 'routines' })
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

describe('completeSlash', () => {
  it('completes command words only', () => {
    expect(completeSlash('/')[0].length).toBeGreaterThan(5)
    expect(completeSlash('/ap')[0]).toEqual(['/approvals', '/approve'])
    expect(completeSlash('/approve ab')[0]).toEqual([])
    expect(completeSlash('hello')[0]).toEqual([])
  })
  it('renders aligned help lines', () => {
    const lines = slashHelpLines()
    expect(lines.some((l) => l.startsWith('/approve <id>'))).toBe(true)
    expect(new Set(lines.map((l) => l.search(/\S\s{2,}\S/) > -1)).has(true)).toBe(true)
  })
})

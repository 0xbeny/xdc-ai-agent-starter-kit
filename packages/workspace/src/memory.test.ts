import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { appendDailyLog, CuratedMemory, MemoryError } from './memory.ts'

const ws = (): string => mkdtempSync(join(tmpdir(), 'mem-'))

describe('CuratedMemory', () => {
  it('starts empty and adds bullets', () => {
    const m = new CuratedMemory(ws())
    expect(m.read()).toBe('')
    const change = m.add('Beny prefers concise answers')
    expect(change.after).toBe('- Beny prefers concise answers\n')
    expect(readFileSync(m.path, 'utf8')).toBe('- Beny prefers concise answers\n')
  })

  it('normalizes whitespace and a leading dash', () => {
    const m = new CuratedMemory(ws())
    m.add('-   two   spaces ')
    expect(m.read()).toBe('- two spaces\n')
  })

  it('rejects duplicates and empty facts', () => {
    const m = new CuratedMemory(ws())
    m.add('fact')
    expect(() => m.add('fact')).toThrow(MemoryError)
    expect(() => m.add('   ')).toThrow(MemoryError)
  })

  it('replaces exactly one matching line (case-insensitive substring)', () => {
    const m = new CuratedMemory(ws())
    m.add('Daily cap is 2 USDC')
    m.add('Timezone is Asia/Dubai')
    m.replace('daily cap', 'Daily cap is 5 USDC')
    expect(m.read()).toBe('- Daily cap is 5 USDC\n- Timezone is Asia/Dubai\n')
  })

  it('refuses ambiguous or missing matches', () => {
    const m = new CuratedMemory(ws())
    m.add('cap A')
    m.add('cap B')
    expect(() => m.remove('cap')).toThrow(/matches 2 lines/)
    expect(() => m.remove('zzz')).toThrow(/No memory line/)
  })

  it('removes a line and leaves the file empty when nothing remains', () => {
    const m = new CuratedMemory(ws())
    m.add('only one')
    m.remove('only')
    expect(m.read()).toBe('')
  })

  it('enforces the size cap without writing', () => {
    const m = new CuratedMemory(ws(), { max: 40 })
    m.add('short fact')
    expect(() => m.add('this fact is definitely far too long to fit')).toThrow(/cap is 40/)
    expect(m.read()).toBe('- short fact\n')
  })
})

describe('appendDailyLog', () => {
  it('writes timestamped bullets into memory/YYYY-MM-DD.md', () => {
    const dir = ws()
    const now = new Date('2026-09-01T10:15:00Z')
    const file = appendDailyLog(dir, 'paid 0.01 USDC for   gas price', now)
    appendDailyLog(dir, 'second', now)
    expect(file.endsWith(join('memory', '2026-09-01.md'))).toBe(true)
    expect(readFileSync(file, 'utf8')).toBe(
      '- 10:15 paid 0.01 USDC for gas price\n- 10:15 second\n',
    )
  })
})

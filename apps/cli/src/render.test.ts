import { describe, expect, it } from 'vitest'

// picocolors decides at import time (CI enables colour, local TTY-less runs disable it);
// force colours off before loading the module so assertions are identical everywhere.
process.env.NO_COLOR = '1'
delete process.env.FORCE_COLOR
const { banner, createStreamRenderer, renderMdLine, statsLine, toolDone, toolLine } =
  await import('./render.ts')

// belt and braces for environments that still emit ANSI
// eslint-disable-next-line no-control-regex -- stripping ANSI codes in test assertions
const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '')

describe('renderMdLine', () => {
  it('styles bullets, bold, code and links without changing text', () => {
    expect(strip(renderMdLine('- **bold** and `code` see [docs](https://x.y)'))).toBe(
      '• bold and code see docs (https://x.y)',
    )
    expect(strip(renderMdLine('## Heading'))).toBe('Heading')
    expect(strip(renderMdLine('1. first'))).toBe('1. first')
  })
})

describe('createStreamRenderer', () => {
  it('buffers to lines, renders markdown, flushes the tail and counts chars', () => {
    let out = ''
    const r = createStreamRenderer((s) => (out += s), '| ')
    r.push('- hel')
    r.push('lo **world**\npart')
    expect(strip(out)).toBe('| • hello world\n')
    expect(r.flush()).toBe('- hello **world**\npart'.length)
    expect(strip(out)).toBe('| • hello world\n| part\n')
  })

  it('streams very long partial lines raw', () => {
    let out = ''
    const r = createStreamRenderer((s) => (out += s), '| ')
    r.push('x'.repeat(200))
    expect(strip(out)).toContain('x'.repeat(200))
    r.push(' tail\n')
    r.flush()
    expect(strip(out).endsWith(' tail\n')).toBe(true)
  })
})

describe('chrome', () => {
  it('renders banner, tool lines and stats', () => {
    const b = strip(
      banner({ model: 'openai/gpt-5.6', wallet: false, skills: 58, pending: 2, workspace: '/x' }),
    )
    expect(b).toContain('xdc-agent')
    expect(b).toContain('58 skills')
    expect(b).toContain('2 approvals waiting')
    expect(strip(toolLine('xdcai_call', { url: 'https://a' }))).toContain('⚙ xdcai_call')
    expect(strip(toolDone('xdcai_call', true, 1234))).toContain('✓ xdcai_call · 1.2s')
    expect(strip(statsLine(3210, { totalTokens: 1234 }))).toBe('  · 3.2s · 1,234 tokens')
  })
})

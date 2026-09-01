import { describe, expect, it } from 'vitest'

import { approvalMessage, chunk, esc } from './format.ts'

describe('format', () => {
  it('escapes MarkdownV2 specials', () => {
    expect(esc('a_b*c.d-e')).toBe('a\\_b\\*c\\.d\\-e')
  })

  it('renders an approval with amount and truncated args', () => {
    const msg = approvalMessage({
      id: 'abcdef12-3456',
      createdAt: new Date().toISOString(),
      status: 'pending',
      tool: 'xdcai_call',
      kind: 'call',
      amount: 250_000n,
      reason: 'above threshold',
      input: { url: 'https://x/y' },
    })
    expect(msg).toContain('0\\.25 USDC')
    expect(msg).toContain('xdcai\\_call')
    expect(msg).toContain('abcdef12')
  })

  it('chunks on paragraph boundaries under the limit', () => {
    const para = 'x'.repeat(1500)
    const text = [para, para, para, para].join('\n\n')
    const parts = chunk(text, 4000)
    expect(parts.length).toBe(2)
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(4000)
    expect(parts.join('')).toHaveLength(text.length - 2) // one separator consumed
  })
})

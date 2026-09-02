import { describe, expect, it } from 'vitest'

import { mergeEnv, parseEnv } from './env-file.ts'

describe('parseEnv', () => {
  it('reads keys, strips quotes and ignores comments', () => {
    expect(parseEnv('# c\nA=1\nB="two words"\nexport C=\'x\'\n\nbad line')).toEqual({
      A: '1',
      B: 'two words',
      C: 'x',
    })
  })
})

describe('mergeEnv', () => {
  it('updates in place, keeps comments and order, appends new keys', () => {
    const before =
      '# models\nMODEL_CHAT=openai/gpt-5.6\nOPENAI_API_KEY=\n\n# storage\nDATABASE_URL=postgres://x\n'
    const after = mergeEnv(before, {
      MODEL_CHAT: 'xai/grok-4.3',
      XAI_API_KEY: 'k 1',
      OPENAI_API_KEY: undefined,
    })
    expect(after).toBe(
      '# models\nMODEL_CHAT=xai/grok-4.3\nOPENAI_API_KEY=\n\n# storage\nDATABASE_URL=postgres://x\n\n# added by xdc-agent setup\nXAI_API_KEY="k 1"\n',
    )
  })

  it('creates a file from nothing', () => {
    expect(mergeEnv('', { A: '1' })).toBe('# added by xdc-agent setup\nA=1\n')
  })

  it('round-trips through parseEnv', () => {
    const text = mergeEnv('', { A: 'plain', B: 'with space', C: 'has#hash' })
    expect(parseEnv(text)).toEqual({ A: 'plain', B: 'with space', C: 'has#hash' })
  })
})

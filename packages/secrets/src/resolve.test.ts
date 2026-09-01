import { describe, expect, it } from 'vitest'

import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadDotEnv, makeRedactor, parseKeyValues, resolveSecrets, secretKeys } from './resolve.ts'

const FAKE_KEY = 'sk-live-1234567890' // gitleaks:allow — fixture, not a credential
const FAKE_PW = 'hunter2hunter2'

describe('parseKeyValues', () => {
  it('parses KEY=VALUE lines and ignores junk', () => {
    expect(parseKeyValues('# c\nA=1\nB="two"\n\nnot a pair\n1BAD=x\nC=\'q\'')).toEqual({
      A: '1',
      B: 'two',
      C: 'q',
    })
  })
})

describe('resolveSecrets', () => {
  const calls: string[] = []
  const run = (file: string, args: string[]): string => {
    calls.push(`${file} ${args.join(' ')}`)
    if (file === 'op') return 'from-1password'
    if (file === 'bws') return JSON.stringify({ value: 'from-bitwarden' })
    if (file === '/bin/sh')
      return 'OPENAI_API_KEY=helper-openai\nXAI_API_KEY=helper-xai\nSECRETS_COMMAND=ignored'
    throw new Error(`unexpected ${file}`)
  }

  it('resolves op:// and bws:// references and leaves plain values alone', () => {
    const out = resolveSecrets(
      {
        ANTHROPIC_API_KEY: 'op://vault/anthropic/key',
        MOONSHOT_API_KEY: 'bws://abc',
        OPENAI_API_KEY: 'plain',
      },
      { run },
    )
    expect(out.env.ANTHROPIC_API_KEY).toBe('from-1password')
    expect(out.env.MOONSHOT_API_KEY).toBe('from-bitwarden')
    expect(out.env.OPENAI_API_KEY).toBe('plain')
    expect(out.resolved.sort()).toEqual(['ANTHROPIC_API_KEY', 'MOONSHOT_API_KEY'])
    expect(calls.some((c) => c.startsWith('op read --no-newline op://vault/anthropic/key'))).toBe(
      true,
    )
  })

  it('fills missing keys from SECRETS_COMMAND; env wins unless override', () => {
    const base = { SECRETS_COMMAND: 'my-vault export', OPENAI_API_KEY: 'mine' }
    const keep = resolveSecrets(base, { run })
    expect(keep.env.OPENAI_API_KEY).toBe('mine')
    expect(keep.env.XAI_API_KEY).toBe('helper-xai')
    const over = resolveSecrets({ ...base, SECRETS_OVERRIDE: '1' }, { run })
    expect(over.env.OPENAI_API_KEY).toBe('helper-openai')
    expect(over.env.SECRETS_COMMAND).toBe('my-vault export')
  })

  it('reports failures without throwing', () => {
    const out = resolveSecrets(
      { A_TOKEN: 'op://x' },
      {
        run: () => {
          throw new Error('op not installed')
        },
      },
    )
    expect(out.env.A_TOKEN).toBe('op://x')
    expect(out.failed).toEqual(['A_TOKEN'])
  })
})

describe('redaction', () => {
  it('finds credential-shaped keys and masks their values in text', () => {
    const env = {
      OPENAI_API_KEY: FAKE_KEY,
      DASHBOARD_PASSWORD: FAKE_PW,
      MODEL_CHAT: 'openai/gpt',
    }
    expect(secretKeys(env).sort()).toEqual(['DASHBOARD_PASSWORD', 'OPENAI_API_KEY'])
    const redact = makeRedactor(env)
    expect(redact('key=sk-live-1234567890 pw=hunter2hunter2 model=openai/gpt')).toBe(
      'key=***890 pw=***er2 model=openai/gpt',
    )
  })

  it('ignores short values so it never masks common words', () => {
    expect(makeRedactor({ X_TOKEN: 'abc' })('abc is fine')).toBe('abc is fine')
  })
})

describe('loadDotEnv', () => {
  it('fills missing variables, never overrides set ones, tolerates a missing file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-'))
    const file = join(dir, '.env')
    writeFileSync(file, 'MODEL_CHAT=openai/gpt-5.6\nEXISTING=from-file\n# comment\nQUOTED="a b"\n')
    const target: NodeJS.ProcessEnv = { EXISTING: 'from-env' }
    expect(loadDotEnv(file, target).sort()).toEqual(['MODEL_CHAT', 'QUOTED'])
    expect(target).toEqual({ EXISTING: 'from-env', MODEL_CHAT: 'openai/gpt-5.6', QUOTED: 'a b' })
    expect(loadDotEnv(join(dir, 'nope'), target)).toEqual([])
  })
})

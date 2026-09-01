import { describe, expect, it } from 'vitest'

import { kitFacts } from './kit-facts.ts'

describe('kitFacts', () => {
  it('names the real commands and the wallet state', () => {
    const on = kitFacts({ walletConnected: true, sandbox: true, skills: 58 })
    expect(on).toContain('xdc-agent dashboard')
    expect(on).toContain('xdc-agent telegram')
    expect(on).toContain('connected — marketplace')
    expect(on).toContain('isolated scratch sandbox')
    const off = kitFacts({ walletConnected: false, sandbox: false, skills: 0 })
    expect(off).toContain('xdc-agent login')
    expect(off).not.toContain('run_command executes')
  })
})

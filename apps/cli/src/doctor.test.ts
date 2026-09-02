import { describe, expect, it } from 'vitest'

import { envChecks } from './doctor.ts'

const by = (cs: ReturnType<typeof envChecks>, name: string) => cs.find((c) => c.name === name)

describe('envChecks', () => {
  it('flags the states that have bitten real installs', () => {
    const bare = envChecks({})
    expect(by(bare, 'chat model')?.status).toBe('fail')
    expect(by(bare, 'api token')?.status).toBe('warn')
    expect(by(bare, 'sandbox')?.status).toBe('ok') // unset means ON since PR #28
    expect(by(bare, 'dashboard')?.status).toBe('ok')

    const off = envChecks({ SANDBOX: 'off' })
    expect(by(off, 'sandbox')?.status).toBe('warn')

    const lockedOut = envChecks({ DASHBOARD_HOST: '0.0.0.0' })
    expect(by(lockedOut, 'dashboard')?.status).toBe('fail')
    const fine = envChecks({ DASHBOARD_HOST: '0.0.0.0', DASHBOARD_PASSWORD: 'x' })
    expect(by(fine, 'dashboard')?.status).toBe('ok')

    expect(by(envChecks({ TELEGRAM_BOT_TOKEN: 't' }), 'telegram')?.detail).toContain('gateway')
  })
})

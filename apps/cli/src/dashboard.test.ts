import { describe, expect, it } from 'vitest'

import { DASHBOARD_HELP, parseDashboardArgs, planHostEnvUpdates } from './dashboard.ts'

describe('parseDashboardArgs', () => {
  it('defaults to open', () => {
    expect(parseDashboardArgs([])).toEqual({ action: 'open', noOpen: false, tailnet: false })
  })
  it('parses actions and options', () => {
    expect(parseDashboardArgs(['--status']).action).toBe('status')
    expect(parseDashboardArgs(['-l']).action).toBe('logs')
    expect(parseDashboardArgs(['--foreground']).action).toBe('foreground')
    expect(parseDashboardArgs(['--tailnet']).tailnet).toBe(true)
    expect(parseDashboardArgs(['--host', '0.0.0.0']).host).toBe('0.0.0.0')
    expect(parseDashboardArgs(['--restart', '--no-open', '--port', '3100'])).toEqual({
      action: 'restart',
      noOpen: true,
      tailnet: false,
      port: 3100,
    })
  })
  it('rejects bad input with help', () => {
    expect(parseDashboardArgs(['--port', 'abc']).action).toBe('help')
    expect(parseDashboardArgs(['--host']).error).toMatch(/--host needs/)
    expect(parseDashboardArgs(['--wat']).error).toMatch(/unknown flag/)
    expect(DASHBOARD_HELP).toContain('--logs')
    expect(DASHBOARD_HELP).toContain('--tailnet')
  })
})

describe('planHostEnvUpdates', () => {
  const gen = () => 'generated-secret'
  it('persists a new --host to .env', () => {
    expect(
      planHostEnvUpdates({ argHost: '127.0.0.1', fileEnv: {}, processEnv: {}, generate: gen }),
    ).toEqual({ updates: { DASHBOARD_HOST: '127.0.0.1' } })
  })
  it('skips the write when .env already matches', () => {
    expect(
      planHostEnvUpdates({
        argHost: '0.0.0.0',
        fileEnv: { DASHBOARD_HOST: '0.0.0.0', DASHBOARD_PASSWORD: 'x' },
        processEnv: {},
        generate: gen,
      }),
    ).toEqual({ updates: {} })
  })
  it('generates a password when the bind goes non-loopback without one', () => {
    expect(
      planHostEnvUpdates({ argHost: '0.0.0.0', fileEnv: {}, processEnv: {}, generate: gen }),
    ).toEqual({
      updates: { DASHBOARD_HOST: '0.0.0.0', DASHBOARD_PASSWORD: 'generated-secret' },
      generatedPassword: 'generated-secret',
    })
  })
  it('generates for an already-saved non-loopback host missing a password', () => {
    expect(
      planHostEnvUpdates({
        fileEnv: { DASHBOARD_HOST: '100.64.0.7' },
        processEnv: {},
        generate: gen,
      }),
    ).toEqual({
      updates: { DASHBOARD_PASSWORD: 'generated-secret' },
      generatedPassword: 'generated-secret',
    })
  })
  it('never generates for loopback binds or when a password exists anywhere', () => {
    expect(planHostEnvUpdates({ fileEnv: {}, processEnv: {}, generate: gen })).toEqual({
      updates: {},
    })
    expect(
      planHostEnvUpdates({
        argHost: '0.0.0.0',
        fileEnv: {},
        processEnv: { DASHBOARD_PASSWORD: 'set' },
        generate: gen,
      }),
    ).toEqual({ updates: { DASHBOARD_HOST: '0.0.0.0' } })
  })
})

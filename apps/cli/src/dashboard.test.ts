import { describe, expect, it } from 'vitest'

import { DASHBOARD_HELP, parseDashboardArgs } from './dashboard.ts'

describe('parseDashboardArgs', () => {
  it('defaults to open', () => {
    expect(parseDashboardArgs([])).toEqual({ action: 'open', noOpen: false })
  })
  it('parses actions and options', () => {
    expect(parseDashboardArgs(['--status']).action).toBe('status')
    expect(parseDashboardArgs(['-l']).action).toBe('logs')
    expect(parseDashboardArgs(['--foreground']).action).toBe('foreground')
    expect(parseDashboardArgs(['--restart', '--no-open', '--port', '3100'])).toEqual({
      action: 'restart',
      noOpen: true,
      port: 3100,
    })
  })
  it('rejects bad input with help', () => {
    expect(parseDashboardArgs(['--port', 'abc']).action).toBe('help')
    expect(parseDashboardArgs(['--wat']).error).toMatch(/unknown flag/)
    expect(DASHBOARD_HELP).toContain('--logs')
  })
})

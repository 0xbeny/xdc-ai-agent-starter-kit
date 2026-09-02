/** Hermes-style rule: loopback binds are open; any wider bind requires a password. */
export function isLoopback(host: string | undefined): boolean {
  const h = (host ?? '127.0.0.1').trim()
  return h === '' || h === '127.0.0.1' || h === 'localhost' || h === '::1'
}

export type GateDecision = { allow: true } | { allow: false; reason: string }

export function gateDecision(bindHost: string | undefined, password: string): GateDecision {
  if (isLoopback(bindHost)) return { allow: true }
  if (password) return { allow: true }
  return {
    allow: false,
    reason:
      'The dashboard is bound to a non-loopback address but no DASHBOARD_PASSWORD is set. ' +
      'Set one (xdc-agent setup, or DASHBOARD_PASSWORD in .env) and restart, or bind to 127.0.0.1.',
  }
}

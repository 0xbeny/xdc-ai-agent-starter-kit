/** Server-only settings for the dashboard. */
export const AGENT_URL = (process.env.AGENT_URL ?? 'http://localhost:4111').replace(/\/$/, '')
export const KIT_API_TOKEN = process.env.KIT_API_TOKEN ?? ''
export const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD ?? ''
export const SESSION_COOKIE = 'kit_session'

import { AGENT_URL, KIT_API_TOKEN } from './config.ts'

/** Server-side call to the agent's kit API. Never exposed to the browser directly. */
export async function kit<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${AGENT_URL}/kit${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(KIT_API_TOKEN ? { 'x-kit-token': KIT_API_TOKEN } : {}),
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`agent ${res.status} on ${path}: ${text.slice(0, 300)}`)
  }
  return (await res.json()) as T
}

export async function kitSafe<T>(path: string, fallback: T): Promise<{ data: T; error?: string }> {
  try {
    return { data: await kit<T>(path) }
  } catch (error) {
    return { data: fallback, error: error instanceof Error ? error.message : String(error) }
  }
}

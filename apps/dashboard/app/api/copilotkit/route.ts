import type { NextRequest } from 'next/server'

import { AGENT_URL, KIT_API_TOKEN } from '@/lib/config.ts'

/** Streams the CopilotKit runtime endpoint from the agent server through the dashboard origin. */
export async function POST(request: NextRequest): Promise<Response> {
  const res = await fetch(`${AGENT_URL}/copilotkit`, {
    method: 'POST',
    headers: {
      'Content-Type': request.headers.get('content-type') ?? 'application/json',
      Accept: request.headers.get('accept') ?? '*/*',
      ...(KIT_API_TOKEN ? { 'x-kit-token': KIT_API_TOKEN } : {}),
    },
    body: request.body,
    // @ts-expect-error -- Node fetch needs duplex for streamed request bodies
    duplex: 'half',
    cache: 'no-store',
  })
  return new Response(res.body, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') ?? 'text/event-stream' },
  })
}

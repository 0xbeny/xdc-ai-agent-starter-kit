import { type NextRequest, NextResponse } from 'next/server'

import { AGENT_URL, KIT_API_TOKEN } from '@/lib/config.ts'

/** Proxies the dashboard's /api/kit/* to the agent's /kit/* (Mastra reserves /api), adding the shared token. The browser never sees the token. */
async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await params
  const url = new URL(`${AGENT_URL}/kit/${path.join('/')}`)
  url.search = request.nextUrl.search
  const body =
    request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text()
  const res = await fetch(url, {
    method: request.method,
    headers: {
      'Content-Type': request.headers.get('content-type') ?? 'application/json',
      ...(KIT_API_TOKEN ? { 'x-kit-token': KIT_API_TOKEN } : {}),
    },
    ...(body !== undefined ? { body } : {}),
    redirect: 'manual',
    cache: 'no-store',
  })
  if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
    return NextResponse.redirect(res.headers.get('location') as string, res.status)
  }
  return new NextResponse(res.body, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' },
  })
}

export { proxy as DELETE, proxy as GET, proxy as PATCH, proxy as POST, proxy as PUT }

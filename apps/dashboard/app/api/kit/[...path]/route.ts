import { type NextRequest, NextResponse } from 'next/server'

import { AGENT_URL, KIT_API_TOKEN } from '@/lib/config.ts'

/** Proxies the dashboard's /api/kit/* to the agent's /kit/* (Mastra reserves /api), adding the shared token. */
async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await params
  const url = new URL(`${AGENT_URL}/kit/${path.join('/')}`)
  url.search = request.nextUrl.search
  let body =
    request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text()
  let contentType = request.headers.get('content-type') ?? 'application/json'
  if (body !== undefined && contentType.includes('application/x-www-form-urlencoded')) {
    body = JSON.stringify(Object.fromEntries(new URLSearchParams(body)))
    contentType = 'application/json'
  }
  const res = await fetch(url, {
    method: request.method,
    headers: {
      'Content-Type': contentType,
      ...(KIT_API_TOKEN ? { 'x-kit-token': KIT_API_TOKEN } : {}),
    },
    ...(body !== undefined ? { body } : {}),
    redirect: 'manual',
    cache: 'no-store',
  })
  const location = res.headers.get('location')
  if (res.status >= 300 && res.status < 400 && location) return NextResponse.redirect(location, 303)
  // HTML form posts expect navigation back to the page they came from
  if (res.ok && request.method === 'POST' && request.headers.get('accept')?.includes('text/html')) {
    return NextResponse.redirect(new URL(request.headers.get('referer') ?? '/', request.url), 303)
  }
  return new NextResponse(res.body, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' },
  })
}

export { proxy as DELETE, proxy as GET, proxy as PATCH, proxy as POST, proxy as PUT }

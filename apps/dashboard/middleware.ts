import { type NextRequest, NextResponse } from 'next/server'

import { DASHBOARD_PASSWORD, SESSION_COOKIE } from './lib/config.ts'
import { isValidSession } from './lib/session.ts'

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next()
  }
  if (await isValidSession(request.cookies.get(SESSION_COOKIE)?.value, DASHBOARD_PASSWORD))
    return NextResponse.next()
  if (pathname.startsWith('/api/'))
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const url = request.nextUrl.clone()
  url.pathname = '/login'
  url.searchParams.set('next', pathname)
  return NextResponse.redirect(url)
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }

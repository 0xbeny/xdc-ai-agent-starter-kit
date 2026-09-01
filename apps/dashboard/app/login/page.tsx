import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { DASHBOARD_PASSWORD, SESSION_COOKIE } from '@/lib/config.ts'
import { passwordMatches, sessionToken } from '@/lib/session.ts'

async function login(formData: FormData): Promise<void> {
  'use server'
  const password = String(formData.get('password') ?? '')
  const next = String(formData.get('next') ?? '/')
  if (!DASHBOARD_PASSWORD || passwordMatches(password, DASHBOARD_PASSWORD)) {
    const jar = await cookies()
    jar.set(SESSION_COOKIE, await sessionToken(DASHBOARD_PASSWORD), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    })
    redirect(next.startsWith('/') ? next : '/')
  }
  redirect('/login?error=1')
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const { next = '/', error } = await searchParams
  if (!DASHBOARD_PASSWORD) redirect(next)
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <p className="eyebrow">xdc-ai-agent-starter-kit</p>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      </div>
      <form action={login} className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        <label className="text-sm text-muted" htmlFor="password">
          Dashboard password
        </label>
        <input id="password" name="password" type="password" autoFocus className="input" />
        {error ? <p className="text-sm text-bad">Wrong password.</p> : null}
        <button type="submit" className="btn-primary">
          Continue
        </button>
      </form>
      <p className="text-xs text-muted">
        Set DASHBOARD_PASSWORD in .env. Without it, the dashboard is open on localhost.
      </p>
    </main>
  )
}

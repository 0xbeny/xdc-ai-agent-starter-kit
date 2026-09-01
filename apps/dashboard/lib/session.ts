const enc = new TextEncoder()

async function hmacHex(key: string, message: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(message))
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Constant-time string comparison without node:crypto so it also runs in Edge middleware. */
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a)
  const y = enc.encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

/** Stateless signed cookie: HMAC(password) so rotating DASHBOARD_PASSWORD logs everyone out. */
export function sessionToken(password: string): Promise<string> {
  return hmacHex(`kit:${password}`, 'session')
}

export async function isValidSession(
  cookie: string | undefined,
  password: string,
): Promise<boolean> {
  if (!password) return true // no password configured → open (local dev)
  if (!cookie) return false
  return safeEqual(await sessionToken(password), cookie)
}

export function passwordMatches(input: string, password: string): boolean {
  return safeEqual(input, password)
}

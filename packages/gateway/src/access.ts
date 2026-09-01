import { randomInt } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export type Role = 'admin' | 'user'

interface AllowlistFile {
  users: Record<string, { role: Role; name?: string; pairedAt: string }>
}

/**
 * Default-deny access for chat channels (Hermes model): env allowlist + a pairing code the human
 * reads from the agent log or dashboard and sends as `/pair CODE`. The first paired user is admin.
 */
export class AccessControl {
  private readonly path: string
  private readonly envAdmins: Set<string>
  private readonly envUsers: Set<string>
  private code: string | undefined
  private codeExpires = 0
  private readonly now: () => number

  constructor(options: {
    path: string
    adminIds?: readonly string[]
    userIds?: readonly string[]
    now?: () => number
  }) {
    this.path = options.path
    this.envAdmins = new Set(options.adminIds ?? [])
    this.envUsers = new Set(options.userIds ?? [])
    this.now = options.now ?? Date.now
  }

  private read(): AllowlistFile {
    if (!existsSync(this.path)) return { users: {} }
    try {
      return JSON.parse(readFileSync(this.path, 'utf8')) as AllowlistFile
    } catch {
      return { users: {} }
    }
  }

  private write(data: AllowlistFile): void {
    mkdirSync(dirname(this.path), { recursive: true })
    const tmp = `${this.path}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 })
    renameSync(tmp, this.path)
  }

  roleOf(userId: string): Role | null {
    if (this.envAdmins.has(userId)) return 'admin'
    if (this.envUsers.has(userId)) return 'user'
    return this.read().users[userId]?.role ?? null
  }

  isAllowed(userId: string): boolean {
    return this.roleOf(userId) !== null
  }

  isAdmin(userId: string): boolean {
    return this.roleOf(userId) === 'admin'
  }

  /** Everyone who should be told about new approvals. */
  adminIds(): string[] {
    const file = this.read()
    return [
      ...new Set([
        ...this.envAdmins,
        ...Object.entries(file.users)
          .filter(([, u]) => u.role === 'admin')
          .map(([id]) => id),
      ]),
    ]
  }

  /** Issues (or returns the live) pairing code; valid 10 minutes. */
  pairingCode(): string {
    if (this.code && this.codeExpires > this.now()) return this.code
    this.code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    this.codeExpires = this.now() + 10 * 60 * 1000
    return this.code
  }

  /** Redeems a code: first user ever becomes admin, later ones users. Code is single-use. */
  pair(userId: string, code: string, name?: string): Role | null {
    if (!this.code || this.codeExpires <= this.now() || code.trim() !== this.code) return null
    const file = this.read()
    const anyAdmin =
      this.envAdmins.size > 0 || Object.values(file.users).some((u) => u.role === 'admin')
    const role: Role = anyAdmin ? 'user' : 'admin'
    file.users[userId] = {
      role,
      ...(name ? { name } : {}),
      pairedAt: new Date(this.now()).toISOString(),
    }
    this.write(file)
    this.code = undefined
    return role
  }

  revoke(userId: string): boolean {
    const file = this.read()
    if (!file.users[userId]) return false
    this.write({
      users: Object.fromEntries(Object.entries(file.users).filter(([id]) => id !== userId)),
    })
    return true
  }
}

export function parseIdList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

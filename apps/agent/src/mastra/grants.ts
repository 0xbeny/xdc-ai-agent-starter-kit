import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

import { createTool } from '@mastra/core/tools'
import { approvalGate } from '@xdc-ai/connectors'
import type { ApprovalStore } from '@xdc-ai/xdcai'
import { appendDailyLog } from '@xdc-ai/workspace'
import { z } from 'zod'

/** Human-approved folder mounts for the command sandbox. The agent requests; the human decides. */
export interface FolderGrant {
  id: string
  path: string
  reason?: string
  createdAt: string
}

export class GrantError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GrantError'
  }
}

const containsOrEqual = (parent: string, child: string): boolean => {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

const SYSTEM_PREFIXES = [
  '/etc',
  '/private',
  '/var',
  '/usr',
  '/bin',
  '/sbin',
  '/System',
  '/Library',
  '/opt',
]
const HOME_DENY = ['.ssh', '.aws', '.gnupg', '.config', '.kube', '.docker', '.nvm', 'Library']

/**
 * The floor no approval can override: credentials, keychains, system dirs, the kit itself
 * (its .env and data/), and anything that CONTAINS one of those (granting ~ or /Users would too).
 */
export function forbiddenGrant(
  path: string,
  ctx: { home?: string; protectedRoots: string[] },
): string | undefined {
  if (!isAbsolute(path)) return 'must be an absolute path'
  const p = resolve(path)
  const home = resolve(ctx.home ?? homedir())
  if (p === '/') return 'cannot grant the filesystem root'
  if (containsOrEqual(p, home))
    return 'grant a specific subfolder, not your home directory or above'
  if (containsOrEqual(home, p)) {
    for (const d of HOME_DENY)
      if (containsOrEqual(join(home, d), p))
        return `contains credentials or keychains (~/${d} is never grantable)`
  } else {
    for (const pre of SYSTEM_PREFIXES)
      if (containsOrEqual(pre, p)) return `system directory (${pre})`
  }
  for (const r of ctx.protectedRoots) {
    const root = resolve(r)
    if (containsOrEqual(root, p) || containsOrEqual(p, root))
      return 'the kit directory (.env, data/) is never grantable'
  }
  if (!existsSync(p) || !statSync(p).isDirectory()) return 'must be an existing directory'
  return undefined
}

/** Plain JSON file (data/grants.json): small, human-inspectable, rewritten atomically per change. */
export class GrantStore {
  private readonly file: string

  constructor(file: string) {
    this.file = file
  }

  list(): FolderGrant[] {
    if (!existsSync(this.file)) return []
    try {
      return JSON.parse(readFileSync(this.file, 'utf8')) as FolderGrant[]
    } catch {
      return []
    }
  }

  paths(): string[] {
    return this.list().map((g) => g.path)
  }

  add(path: string, reason?: string): FolderGrant {
    const p = resolve(path)
    const rest = this.list().filter((g) => g.path !== p)
    const grant: FolderGrant = {
      id: randomUUID(),
      path: p,
      ...(reason ? { reason } : {}),
      createdAt: new Date().toISOString(),
    }
    this.save([...rest, grant])
    return grant
  }

  revoke(idOrPrefix: string): FolderGrant {
    const hits = this.list().filter((g) => g.id === idOrPrefix || g.id.startsWith(idOrPrefix))
    if (hits.length === 0) throw new GrantError(`no grant matches "${idOrPrefix}"`)
    if (hits.length > 1) throw new GrantError(`"${idOrPrefix}" is ambiguous`)
    const hit = hits[0] as FolderGrant
    this.save(this.list().filter((g) => g.id !== hit.id))
    return hit
  }

  private save(list: FolderGrant[]): void {
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, `${JSON.stringify(list, null, 2)}\n`)
  }
}

export interface GrantDeps {
  grants: GrantStore
  approvals: ApprovalStore
  workspaceDir: string
  protectedRoots: string[]
  home?: string
}

export interface GrantResult {
  ok: boolean
  message: string
  approvalId?: string
}

export async function runFolderRequest(
  deps: GrantDeps,
  input: { path: string; reason: string; approvalId?: string | undefined },
): Promise<GrantResult> {
  const denied = forbiddenGrant(input.path, {
    protectedRoots: deps.protectedRoots,
    ...(deps.home ? { home: deps.home } : {}),
  })
  if (denied) return { ok: false, message: `never grantable: ${denied}` }
  const p = resolve(input.path)
  const gate = await approvalGate(
    deps.approvals,
    'folder_request',
    'write',
    {
      path: p,
      reason: input.reason,
      ...(input.approvalId ? { approvalId: input.approvalId } : {}),
    },
    'folder access',
    {
      kind: 'grant',
      reason: `folder access: mount ${p} read-write into the command sandbox — ${input.reason}`,
      preview: p,
    },
  )
  if (!gate.ok) {
    const out: GrantResult = { ok: false, message: gate.error ?? 'not approved' }
    if (gate.approvalId) out.approvalId = gate.approvalId
    return out
  }
  deps.grants.add(p, input.reason)
  appendDailyLog(deps.workspaceDir, `folder granted: ${p} (${input.reason.slice(0, 120)})`)
  return {
    ok: true,
    message: `granted — run_command can now read/write ${p}. The human can revoke it with /grants.`,
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- Mastra infers the Tool generics
export function createGrantTools(deps: GrantDeps) {
  return {
    folder_request: createTool({
      id: 'folder_request',
      description:
        'Ask the human to mount one specific folder read-write into your command sandbox (approval-gated; credentials, keychains and the kit itself are never grantable). ' +
        'Returns approval_required first; re-call with the approvalId once the human approves.',
      inputSchema: z.object({
        path: z.string().describe('Absolute path to an existing directory'),
        reason: z.string().describe('One line: why you need it'),
        approvalId: z.string().optional(),
      }),
      execute: async (input) => runFolderRequest(deps, input),
    }),
    folder_list: createTool({
      id: 'folder_list',
      description: 'List the folders the human has granted to your command sandbox.',
      inputSchema: z.object({}),
      execute: async () => ({ grants: deps.grants.list() }),
    }),
  }
}

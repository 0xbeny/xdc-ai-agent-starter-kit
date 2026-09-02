import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { registerApiRoute } from '@mastra/core/server'
import { describeModel } from '@xdc-ai/models'
import { DEFAULT_BUDGETS, loadWorkspace, type WorkspaceFile } from '@xdc-ai/workspace'
import { clientFromEnv, finishConnect, startConnect } from '@xdc-ai/connectors'
import { formatUsdc, latestById, startOfUtcDay } from '@xdc-ai/xdcai'

import type { Kit } from './kit.ts'

const dashboardUrl = (kit: Kit): string =>
  (kit.config.env.DASHBOARD_URL?.trim() || 'http://localhost:3000').replace(/\/$/, '')

const EDITABLE: WorkspaceFile[] = ['SOUL.md', 'IDENTITY.md', 'USER.md', 'AGENTS.md', 'MEMORY.md']
const VERSION = '0.1.0-dev'

type RouteOptions = Parameters<typeof registerApiRoute>[1]
type Handler = NonNullable<RouteOptions['handler']>
type Ctx = Parameters<Handler>[0]
type Route = ReturnType<typeof registerApiRoute>

const json = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value, (_k, v: unknown) => (typeof v === 'bigint' ? formatUsdc(v) : v)))

/** Shared-secret guard: when KIT_API_TOKEN is set, every kit route needs the header. */
function requireToken(kit: Kit, c: Ctx): Response | undefined {
  const expected = kit.config.env.KIT_API_TOKEN?.trim()
  if (!expected) return undefined
  if (c.req.header('x-kit-token') !== expected) return c.json({ error: 'unauthorized' }, 401)
  return undefined
}

function route(
  kit: Kit,
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  handler: Handler,
): Route {
  return registerApiRoute(path, {
    method,
    requiresAuth: false,
    handler: async (c, next) => requireToken(kit, c) ?? handler(c, next),
  })
}

export function kitRoutes(kit: Kit): Route[] {
  return [
    route(kit, '/kit/status', 'GET', async (c) => {
      const ws = loadWorkspace(kit.config.workspaceDir)
      const pending = await kit.approvals.list('pending')
      return c.json(
        json({
          version: VERSION,
          model: {
            chat: describeModel(kit.config.slots.chat),
            fast: describeModel(kit.config.slots.fast),
            ...(kit.config.slots.embed ? { embed: describeModel(kit.config.slots.embed) } : {}),
          },
          missingKeys: kit.config.missingKeys,
          workspace: {
            dir: ws.dir,
            files: ws.files.map((f) => ({ name: f.name, chars: f.chars, truncated: f.truncated })),
            missing: ws.missing,
            bootstrap: ws.bootstrap,
          },
          wallet: { connected: kit.walletConnected() },
          policy: kit.config.policy,
          spentToday: await kit.policy.spentToday(),
          pendingApprovals: pending.length,
          connectors: kit
            .enabledConnectors()
            .map((c) => ({ id: c.id, label: c.label, connected: kit.connectorConnected(c.id) })),
        }),
      )
    }),

    route(kit, '/kit/workspace/:name', 'GET', async (c) => {
      const name = (c.req.param('name') ?? '') as WorkspaceFile
      if (!EDITABLE.includes(name)) return c.json({ error: 'not editable' }, 404)
      const path = join(kit.config.workspaceDir, name)
      const text = existsSync(path) ? readFileSync(path, 'utf8') : ''
      return c.json({ name, text, budget: DEFAULT_BUDGETS[name], chars: text.length })
    }),

    route(kit, '/kit/workspace/:name', 'PUT', async (c) => {
      const name = (c.req.param('name') ?? '') as WorkspaceFile
      if (!EDITABLE.includes(name)) return c.json({ error: 'not editable' }, 404)
      const body = (await c.req.json()) as { text?: unknown }
      if (typeof body.text !== 'string') return c.json({ error: 'text required' }, 400)
      writeFileSync(join(kit.config.workspaceDir, name), body.text)
      return c.json({ ok: true, name, chars: body.text.length, budget: DEFAULT_BUDGETS[name] })
    }),

    route(kit, '/kit/ledger', 'GET', async (c) => {
      const days = Math.min(90, Math.max(1, Number(c.req.query('days') ?? 7)))
      const since = new Date(startOfUtcDay(new Date()).getTime() - (days - 1) * 86_400_000)
      const rows = latestById(await kit.ledger.since(since)).sort(
        (a, b) => Date.parse(b.at) - Date.parse(a.at),
      )
      return c.json(json({ entries: rows, spentToday: await kit.policy.spentToday() }))
    }),

    route(kit, '/kit/approvals', 'GET', async (c) => {
      const status = c.req.query('status')
      const list = await kit.approvals.list(status ? (status as 'pending') : undefined)
      return c.json(json({ approvals: list }))
    }),

    route(kit, '/kit/approvals/:id/decide', 'POST', async (c) => {
      const body = (await c.req.json()) as { decision?: unknown; note?: unknown }
      if (body.decision !== 'approved' && body.decision !== 'denied')
        return c.json({ error: 'decision must be approved|denied' }, 400)
      try {
        const approval = await kit.approvals.decide(
          c.req.param('id') ?? '',
          body.decision,
          typeof body.note === 'string' ? body.note : undefined,
        )
        return c.json(json({ approval }))
      } catch (error) {
        return c.json({ error: error instanceof Error ? error.message : String(error) }, 409)
      }
    }),

    route(kit, '/kit/wallet', 'GET', async (c) => {
      if (!kit.walletConnected()) return c.json({ connected: false })
      try {
        const [address, balance] = await Promise.all([
          kit.callReadTool('wallet_address'),
          kit.callReadTool('wallet_balance'),
        ])
        return c.json(json({ connected: true, address, balance }))
      } catch (error) {
        return c.json({
          connected: true,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }),

    route(kit, '/kit/marketplace', 'GET', async (c) => {
      const catalog = await kit.getCatalog()
      if (!catalog)
        return c.json({
          entries: [],
          note: kit.walletConnected()
            ? 'catalog not loaded yet'
            : 'connect the wallet to browse the marketplace',
        })
      const search = c.req.query('search') ?? ''
      const entries = (search ? catalog.search(search) : catalog.entries).slice(0, 200)
      return c.json(json({ entries }))
    }),

    route(kit, '/kit/connectors', 'GET', async (c) =>
      c.json({
        connectors: await Promise.all(
          kit.enabledConnectors().map(async (def) => ({
            id: def.id,
            label: def.group ? `${def.group} · ${def.label}` : def.label,
            description: def.description,
            connected: kit.connectorConnected(def.id),
            toolCount: await kit.connectorToolCount(def.id),
            scopes: def.scopes ?? [],
            status: def.status ?? 'ga',
            needsClientCredentials: !def.supportsDcr && !clientFromEnv(def, kit.config.env),
          })),
        ),
      }),
    ),

    route(kit, '/kit/connectors/:id/connect', 'POST', async (c) => {
      const id = c.req.param('id') ?? ''
      try {
        const result = await startConnect(kit.connectorProvider(id))
        if (result.status === 'authorized')
          return c.redirect(`${dashboardUrl(kit)}/connections?connected=${id}`)
        return c.redirect(result.authorizationUrl as string)
      } catch (error) {
        return c.redirect(
          `${dashboardUrl(kit)}/connections?error=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`,
        )
      }
    }),

    // Vendor redirect target — no token header possible here, so it is unauthenticated by design and only completes a flow this server started.
    registerApiRoute('/kit/connectors/:id/callback', {
      method: 'GET',
      requiresAuth: false,
      handler: async (c) => {
        const id = c.req.param('id') ?? ''
        const code = c.req.query('code')
        const state = c.req.query('state')
        if (!code)
          return c.redirect(
            `${dashboardUrl(kit)}/connections?error=${encodeURIComponent(c.req.query('error') ?? 'no code returned')}`,
          )
        try {
          await finishConnect(kit.connectorProvider(id), code, state)
          kit.resetConnector(id)
          return c.redirect(`${dashboardUrl(kit)}/connections?connected=${id}`)
        } catch (error) {
          return c.redirect(
            `${dashboardUrl(kit)}/connections?error=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`,
          )
        }
      },
    }),

    route(kit, '/kit/routines', 'GET', async (c) => {
      const mastra = c.get('mastra')
      const list = await mastra.schedules.list()
      return c.json(json({ routines: list, runs: kit.routineRuns.list(30) }))
    }),

    route(kit, '/kit/routines', 'POST', async (c) => {
      const body = (await c.req.json()) as {
        cron?: unknown
        prompt?: unknown
        timezone?: unknown
        agentId?: unknown
      }
      if (typeof body.cron !== 'string' || typeof body.prompt !== 'string' || !body.prompt.trim()) {
        return c.json({ error: 'cron and prompt are required' }, 400)
      }
      const mastra = c.get('mastra')
      try {
        const routine = await mastra.schedules.create({
          agentId: typeof body.agentId === 'string' && body.agentId ? body.agentId : 'assistant',
          cron: body.cron,
          prompt: body.prompt,
          ...(typeof body.timezone === 'string' && body.timezone
            ? { timezone: body.timezone }
            : {}),
        })
        return c.json(json({ routine }))
      } catch (error) {
        return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
      }
    }),

    route(kit, '/kit/routines/:id/:action', 'POST', async (c) => {
      const mastra = c.get('mastra')
      const id = c.req.param('id') ?? ''
      const action = c.req.param('action')
      try {
        if (action === 'pause') await mastra.schedules.pause(id)
        else if (action === 'resume') await mastra.schedules.resume(id)
        else if (action === 'run') await mastra.schedules.run(id)
        else if (action === 'delete') await mastra.schedules.delete(id)
        else return c.json({ error: 'unknown action' }, 400)
        return c.redirect(`${dashboardUrl(kit)}/routines`)
      } catch (error) {
        return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
      }
    }),

    route(kit, '/kit/grants', 'GET', async (c) => c.json(json({ grants: kit.grants.list() }))),

    route(kit, '/kit/grants/:id/revoke', 'POST', async (c) => {
      try {
        return c.json(json({ revoked: kit.grants.revoke(c.req.param('id') ?? '') }))
      } catch (error) {
        return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
      }
    }),

    route(kit, '/kit/connectors/:id/disconnect', 'POST', async (c) => {
      const id = c.req.param('id') ?? ''
      kit.connectorProvider(id).invalidateCredentials('all')
      kit.resetConnector(id)
      return c.redirect(`${dashboardUrl(kit)}/connections?disconnected=${id}`)
    }),
  ]
}

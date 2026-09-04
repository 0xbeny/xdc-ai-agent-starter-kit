import { createTool } from '@mastra/core/tools'
import { approvalGate } from '@xdc-ai/connectors'
import type { ApprovalStore } from '@xdc-ai/xdcai'
import {
  appendDailyLog,
  SOUL_DOCS,
  validateSkill,
  writeSkill,
  writeSoulDoc,
} from '@xdc-ai/workspace'
import { z } from 'zod'

/**
 * Self-improvement tools (ADR-0008 approval protocol): the agent proposes, a human approves in the
 * dashboard/Telegram/CLI, then the same call with the approvalId applies the change.
 */
export interface ImproveDeps {
  workspaceDir: string
  approvals: ApprovalStore
  /** Kit API self-call target for routine_create (the schedule engine lives in the server). */
  agentPort: number
  apiToken?: string
}

export interface ImproveResult {
  ok: boolean
  message: string
  approvalId?: string
  path?: string
}

async function gated(
  deps: ImproveDeps,
  tool: string,
  input: Record<string, unknown>,
  reason: string,
  preview: string,
  apply: () => Promise<ImproveResult> | ImproveResult,
): Promise<ImproveResult> {
  const gate = await approvalGate(deps.approvals, tool, 'write', input, 'self-improvement', {
    kind: 'improve',
    reason,
    preview,
  })
  if (!gate.ok) {
    const out: ImproveResult = { ok: false, message: gate.error ?? 'not approved' }
    if (gate.approvalId) out.approvalId = gate.approvalId
    return out
  }
  return apply()
}

export async function runSkillWrite(
  deps: ImproveDeps,
  input: { category: string; name: string; content: string; approvalId?: string | undefined },
): Promise<ImproveResult> {
  try {
    validateSkill(input.category, input.name, input.content)
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
  return gated(
    deps,
    'skill_write',
    { ...input },
    `self-improvement: write skill "${input.category}/${input.name}" — review the skill content`,
    input.content.slice(0, 4000),
    () => {
      const r = writeSkill(deps.workspaceDir, input.category, input.name, input.content)
      appendDailyLog(deps.workspaceDir, `skill_write: ${r.action} ${input.category}/${input.name}`)
      return { ok: true, message: `${r.action} — available via skills_list now`, path: r.path }
    },
  )
}

export async function runSoulPropose(
  deps: ImproveDeps,
  input: { file: string; content: string; summary: string; approvalId?: string | undefined },
): Promise<ImproveResult> {
  return gated(
    deps,
    'soul_propose',
    { ...input },
    `self-improvement: edit ${input.file} — ${input.summary}`,
    input.content.slice(0, 4000),
    () => {
      const r = writeSoulDoc(deps.workspaceDir, input.file, input.content)
      appendDailyLog(
        deps.workspaceDir,
        `soul_propose: ${input.file} (${r.previousChars} -> ${input.content.length} chars): ${input.summary.slice(0, 120)}`,
      )
      return {
        ok: true,
        message: `${input.file} updated (${r.previousChars} -> ${input.content.length} chars) — applies from the next turn`,
        path: r.path,
      }
    },
  )
}

export async function runRoutineCreate(
  deps: ImproveDeps,
  input: {
    name?: string | undefined
    cron: string
    prompt: string
    timezone?: string | undefined
    approvalId?: string | undefined
  },
): Promise<ImproveResult> {
  if (!input.cron.trim() || !input.prompt.trim())
    return { ok: false, message: 'cron and prompt are required' }
  return gated(
    deps,
    'routine_create',
    { ...input },
    `self-improvement: new routine "${input.name ?? input.prompt.slice(0, 40)}" (cron ${input.cron}) — will run unattended`,
    JSON.stringify({ cron: input.cron, prompt: input.prompt, timezone: input.timezone }, null, 2),
    async () => {
      let res: Response
      try {
        res = await fetch(`http://127.0.0.1:${deps.agentPort}/kit/routines`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(deps.apiToken ? { 'x-kit-token': deps.apiToken } : {}),
          },
          body: JSON.stringify({
            cron: input.cron,
            prompt: input.prompt,
            timezone: input.timezone,
          }),
        })
      } catch (error) {
        return {
          ok: false,
          message: `routine engine unreachable on :${deps.agentPort}: ${error instanceof Error ? error.message : String(error)}`,
        }
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok)
        return { ok: false, message: `routine engine refused: ${body.error ?? res.status}` }
      appendDailyLog(
        deps.workspaceDir,
        `routine_create: ${input.cron} ${input.prompt.slice(0, 120)}`,
      )
      return { ok: true, message: `routine created (cron ${input.cron}) — manage it on /routines` }
    },
  )
}

async function kitApi(
  deps: ImproveDeps,
  path: string,
  method: 'GET' | 'POST',
): Promise<{ ok: boolean; status: number; body: unknown }> {
  try {
    const res = await fetch(`http://127.0.0.1:${deps.agentPort}${path}`, {
      method,
      redirect: 'manual',
      headers: deps.apiToken ? { 'x-kit-token': deps.apiToken } : {},
    })
    const ok = res.ok || (res.status >= 300 && res.status < 400) // action routes redirect on success
    const body: unknown = ok && res.status < 300 ? await res.json().catch(() => ({})) : {}
    return { ok, status: res.status, body }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: {
        error: `routine engine unreachable on :${deps.agentPort}: ${error instanceof Error ? error.message : String(error)}`,
      },
    }
  }
}

export async function runRoutinesList(deps: ImproveDeps): Promise<unknown> {
  const r = await kitApi(deps, '/kit/routines', 'GET')
  if (!r.ok)
    return { ok: false, message: (r.body as { error?: string }).error ?? `HTTP ${r.status}` }
  return { ok: true, ...(r.body as object) }
}

/** Pausing/resuming/deleting only reduces or restores already-approved autonomy — no approval needed. */
export async function runRoutineManage(
  deps: ImproveDeps,
  input: { action: 'pause' | 'resume' | 'delete' | 'run'; id: string },
): Promise<ImproveResult> {
  if (!input.id.trim()) return { ok: false, message: 'id is required (routines_list shows them)' }
  const r = await kitApi(
    deps,
    `/kit/routines/${encodeURIComponent(input.id)}/${input.action}`,
    'POST',
  )
  if (!r.ok)
    return { ok: false, message: (r.body as { error?: string }).error ?? `HTTP ${r.status}` }
  appendDailyLog(deps.workspaceDir, `routine ${input.action}: ${input.id}`)
  return {
    ok: true,
    message: `routine ${input.id} ${input.action}${input.action === 'run' ? ' started' : input.action.endsWith('e') ? 'd' : 'ed'}`,
  }
}

/** Changing WHAT runs unattended is a behaviour change → approval-gated like routine_create. */
export async function runRoutineUpdate(
  deps: ImproveDeps,
  input: {
    id: string
    cron?: string | undefined
    prompt?: string | undefined
    timezone?: string | undefined
    reason: string
    approvalId?: string | undefined
  },
): Promise<ImproveResult> {
  if (!input.id.trim()) return { ok: false, message: 'id is required (routines_list shows them)' }
  if (!input.cron && !input.prompt && !input.timezone)
    return { ok: false, message: 'nothing to change — pass cron, prompt and/or timezone' }
  return gated(
    deps,
    'routine_update',
    { ...input },
    `self-improvement: change routine ${input.id}${input.cron ? ` cron→${input.cron}` : ''}${input.prompt ? ' (new prompt)' : ''} — ${input.reason}`,
    JSON.stringify(
      { id: input.id, cron: input.cron, prompt: input.prompt, timezone: input.timezone },
      null,
      2,
    ),
    async () => {
      const res = await fetch(
        `http://127.0.0.1:${deps.agentPort}/kit/routines/${encodeURIComponent(input.id)}/update`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(deps.apiToken ? { 'x-kit-token': deps.apiToken } : {}),
          },
          body: JSON.stringify({
            cron: input.cron,
            prompt: input.prompt,
            timezone: input.timezone,
          }),
        },
      ).catch((error: unknown) => {
        throw new Error(
          `routine engine unreachable on :${deps.agentPort}: ${error instanceof Error ? error.message : String(error)}`,
        )
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok)
        return { ok: false, message: `routine engine refused: ${body.error ?? res.status}` }
      appendDailyLog(deps.workspaceDir, `routine_update: ${input.id} ${input.reason.slice(0, 120)}`)
      return { ok: true, message: `routine ${input.id} updated — routines_list to confirm` }
    },
  )
}

const approvalId = z
  .string()
  .optional()
  .describe('Set only after the human approved; single-use and bound to identical arguments')

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- Mastra infers the Tool generics
export function createImproveTools(deps: ImproveDeps) {
  return {
    skill_write: createTool({
      id: 'skill_write',
      description:
        'Author or update one of your own skills (workspace/skills/<category>/<name>/SKILL.md, frontmatter name+description required). ' +
        'Returns approval_required first: explain the skill to the human, wait, then call again with the approvalId.',
      inputSchema: z.object({
        category: z.string().describe('kebab-case category, e.g. "ops"'),
        name: z.string().describe('kebab-case skill name; must equal frontmatter name'),
        content: z.string().describe('Full SKILL.md content including frontmatter'),
        approvalId,
      }),
      execute: async (input) => runSkillWrite(deps, input),
    }),
    soul_propose: createTool({
      id: 'soul_propose',
      description:
        `Propose a new full version of one of your instruction files (${SOUL_DOCS.join(', ')}). ` +
        'Approval-gated: the human reviews the content before it replaces the file. Use memory for facts; this is for durable behaviour changes.',
      inputSchema: z.object({
        file: z.enum(SOUL_DOCS),
        content: z.string().describe('The complete replacement file content'),
        summary: z.string().describe('One line: what changes and why'),
        approvalId,
      }),
      execute: async (input) => runSoulPropose(deps, input),
    }),
    routines_list: createTool({
      id: 'routines_list',
      description: 'List scheduled routines (id, cron, prompt, status) and recent runs.',
      inputSchema: z.object({}),
      execute: async () => runRoutinesList(deps),
    }),
    routine_manage: createTool({
      id: 'routine_manage',
      description:
        'Pause, resume, delete, or run-now an existing routine by id (routines_list first). No approval needed — this only reduces or restores already-approved behaviour. To MODIFY a routine: routine_create the replacement (approval-gated), then delete the old one.',
      inputSchema: z.object({
        action: z.enum(['pause', 'resume', 'delete', 'run']),
        id: z.string(),
      }),
      execute: async (input) => runRoutineManage(deps, input),
    }),
    routine_update: createTool({
      id: 'routine_update',
      description:
        'Change an existing routine in place (cron, prompt, timezone). Approval-gated: explain the change, wait for the y/n, re-call with the approvalId.',
      inputSchema: z.object({
        id: z.string(),
        cron: z.string().optional(),
        prompt: z.string().optional(),
        timezone: z.string().optional(),
        reason: z.string(),
        approvalId,
      }),
      execute: async (input) => runRoutineUpdate(deps, input),
    }),
    routine_create: createTool({
      id: 'routine_create',
      description:
        'Schedule a recurring prompt to yourself (cron). Approval-gated. Use when the human wants something checked or done on a cadence.',
      inputSchema: z.object({
        name: z.string().optional(),
        cron: z.string().describe('5-field cron expression'),
        prompt: z.string().describe('What you will be asked each run'),
        timezone: z.string().optional(),
        approvalId,
      }),
      execute: async (input) => runRoutineCreate(deps, input),
    }),
  }
}

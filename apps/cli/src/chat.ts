import { emitKeypressEvents } from 'node:readline'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

import { join } from 'node:path'

import pc from 'picocolors'

import { openDashboard } from './dashboard.ts'
import { completeSlash, matchApprovalId, parseSlash, slashHelpLines } from './slash.ts'

interface ApprovalLike {
  id: string
  tool: string
  kind: string
  reason: string
  status: string
  amount?: bigint
}

/** Loaded lazily: the agent bundle is heavy and not needed for `setup`/`login`. */
async function loadAgent() {
  const [{ mastra }, { getKit }] = await Promise.all([
    import('../../agent/src/mastra/index.ts'),
    import('../../agent/src/mastra/kit.ts'),
  ])
  return { mastra, agent: mastra.getAgent('assistant'), kit: getKit() }
}

const usdc = (micro: bigint | number): string => `${Number(micro) / 1_000_000} USDC`

function table(rows: [string, string][]): string {
  const w = Math.max(...rows.map(([k]) => k.length))
  return rows.map(([k, v]) => `  ${k.padEnd(w + 2)}${v}`).join('\n')
}

function clip(text: string, max = 6000): string {
  return text.length <= max
    ? text
    : `${text.slice(0, max)}\n… (${text.length - max} more characters; open the file in workspace/skills)`
}

const HELP = `\n  ${pc.bold('Type a message')} to talk to your agent. Slash commands (Tab completes):\n${slashHelpLines()
  .map((l) => `  ${l}`)
  .join('\n')}\n`

function fmtApproval(a: ApprovalLike): string {
  const amt = a.amount !== undefined ? ` · ${Number(a.amount) / 1_000_000} USDC` : ''
  return `${pc.yellow(a.id.slice(0, 8))}  ${a.kind}${amt}  ${pc.dim(a.tool)}\n           ${a.reason}`
}

type KitLike = Awaited<ReturnType<typeof loadAgent>>['kit']

async function statusText(kit: KitLike): Promise<string> {
  const { listSkills, loadWorkspace } = await import('@xdc-ai/workspace')
  const ws = loadWorkspace(kit.config.workspaceDir)
  const name = kit.config.slots.chat
  return [
    `  model     ${name.provider}/${name.model}`,
    `  wallet    ${kit.walletConnected() ? 'connected' : 'not connected (xdc-agent login)'}`,
    `  workspace ${kit.config.workspaceDir} (${ws.files.map((f) => f.name).join(', ') || 'empty'})`,
    `  skills    ${listSkills(kit.config.workspaceDir).length}`,
    `  spent     ${Number(await kit.policy.spentToday()) / 1_000_000} USDC today`,
  ].join('\n')
}

/** `xdc-agent status` — prints and exits without opening the REPL. */
export async function printStatus(): Promise<void> {
  const { kit } = await loadAgent()
  console.log(await statusText(kit))
  process.exit(0)
}

export async function runChat(): Promise<void> {
  process.stdout.write(pc.dim('starting your agent…\n'))
  const { mastra, agent, kit } = await loadAgent()
  const root = join(kit.config.workspaceDir, '..')
  let lastMessage: string | undefined
  let lastUsage: unknown
  const resource = `cli:${process.env.USER ?? 'local'}`
  let thread = `cli:${Date.now()}`
  const interactive = stdin.isTTY === true
  const rl = createInterface({
    input: stdin,
    output: stdout,
    terminal: interactive,
    completer: completeSlash,
  })
  if (interactive) {
    // Typing "/" on an empty line shows the command list right away (Tab still completes).
    emitKeypressEvents(stdin, rl)
    stdin.on('keypress', (ch: string | undefined) => {
      if (ch === '/' && rl.line === '/') {
        stdout.write(
          `\n${pc.dim(
            slashHelpLines()
              .map((l) => `  ${l}`)
              .join('\n'),
          )}\n`,
        )
        rl.prompt(true)
      }
    })
  }
  const closed = new Promise<null>((resolve) => rl.once('close', () => resolve(null)))
  const name = kit.config.slots.chat
  console.log(
    `${pc.bgCyan(pc.black(' xdc-agent '))} ${pc.dim(`${name.provider}/${name.model} · workspace ${kit.config.workspaceDir}`)}`,
  )
  console.log(pc.dim('  /help for commands · Ctrl+C to leave'))

  const showPending = async (): Promise<void> => {
    const pending = (await kit.approvals.list('pending')) as ApprovalLike[]
    if (pending.length === 0) return
    console.log(
      pc.yellow(
        `\n  ${pending.length} approval${pending.length > 1 ? 's' : ''} waiting — /approvals to review`,
      ),
    )
  }

  for (;;) {
    const answer = await Promise.race([rl.question(pc.cyan('\nyou › ')).catch(() => null), closed])
    if (answer === null) break // Ctrl+D / stdin closed
    const line = answer
    const cmd = parseSlash(line)
    if (cmd.kind === 'message' && cmd.text === '') continue
    if (cmd.kind === 'quit') break
    if (cmd.kind === 'help') {
      console.log(HELP)
      continue
    }
    if (cmd.kind === 'new') {
      thread = `cli:${Date.now()}`
      console.log(pc.dim('  new conversation'))
      continue
    }
    if (cmd.kind === 'status') {
      const ws = (await import('@xdc-ai/workspace')).loadWorkspace(kit.config.workspaceDir)
      const skills = (await import('@xdc-ai/workspace')).listSkills(kit.config.workspaceDir).length
      console.log(
        `  model     ${name.provider}/${name.model}\n  wallet    ${kit.walletConnected() ? 'connected' : 'not connected (xdc-agent login)'}\n  workspace ${kit.config.workspaceDir} (${ws.files.map((f) => f.name).join(', ') || 'empty'})\n  skills    ${skills}\n  spent     ${Number(await kit.policy.spentToday()) / 1_000_000} USDC today`,
      )
      continue
    }
    if (cmd.kind === 'approvals') {
      const pending = (await kit.approvals.list('pending')) as ApprovalLike[]
      console.log(
        pending.length
          ? pending.map((a) => `  ${fmtApproval(a)}`).join('\n')
          : pc.dim('  nothing pending'),
      )
      continue
    }
    if (cmd.kind === 'approve' || cmd.kind === 'deny') {
      const pending = (await kit.approvals.list('pending')) as ApprovalLike[]
      const hit = matchApprovalId(pending, cmd.id)
      if (!hit) {
        console.log(pc.red('  no unique pending approval matches that id'))
        continue
      }
      await kit.approvals.decide(hit.id, cmd.kind === 'approve' ? 'approved' : 'denied', 'via cli')
      console.log(
        cmd.kind === 'approve'
          ? pc.green(`  approved ${hit.id.slice(0, 8)} — tell the agent to continue`)
          : pc.yellow(`  denied ${hit.id.slice(0, 8)}`),
      )
      continue
    }
    if (cmd.kind === 'model') {
      if (!cmd.spec) {
        console.log(
          table([
            ['chat', `${name.provider}/${name.model}`],
            ['fast', `${kit.config.slots.fast.provider}/${kit.config.slots.fast.model}`],
            [
              'embed',
              kit.config.slots.embed
                ? `${kit.config.slots.embed.provider}/${kit.config.slots.embed.model}`
                : '— (RAG not enabled)',
            ],
          ]),
        )
        console.log(
          pc.dim(
            '  /model provider/model  switches (e.g. /model xai/grok-4.3, /model claude-code/sonnet); needs the matching key in .env',
          ),
        )
        continue
      }
      try {
        const { parseModelSpec, providerEnvKey } = await import('@xdc-ai/models')
        const spec = parseModelSpec(cmd.spec)
        const { mergeEnv } = await import('./env-file.ts')
        const { existsSync, readFileSync, writeFileSync } = await import('node:fs')
        const { join } = await import('node:path')
        const envFile = join(kit.config.workspaceDir, '..', '.env')
        const text = existsSync(envFile) ? readFileSync(envFile, 'utf8') : ''
        writeFileSync(envFile, mergeEnv(text, { MODEL_CHAT: cmd.spec }))
        const key = providerEnvKey(spec.provider)
        console.log(
          pc.green(`  MODEL_CHAT=${cmd.spec} saved to .env`) +
            (key && !process.env[key] ? pc.yellow(`\n  ${key} is not set — add it to .env`) : '') +
            pc.dim('\n  restart the chat (/quit, then xdc-agent) to use it'),
        )
      } catch (error) {
        console.log(pc.red(`  ${error instanceof Error ? error.message : String(error)}`))
      }
      continue
    }
    if (cmd.kind === 'skills') {
      const { listSkills } = await import('@xdc-ai/workspace')
      const skills = listSkills(kit.config.workspaceDir)
      const byCat = new Map<string, string[]>()
      for (const sk of skills)
        byCat.set(sk.category, [
          ...(byCat.get(sk.category) ?? []),
          `${pc.bold(sk.name)} ${pc.dim(`— ${sk.description}`)}`,
        ])
      for (const [cat, items] of [...byCat.entries()].sort())
        console.log(`  ${pc.cyan(cat)}\n${items.map((i) => `    ${i}`).join('\n')}`)
      console.log(
        pc.dim(
          `  ${skills.length} skills · /skill <name> to read one · add yours under workspace/skills/<category>/<name>/SKILL.md`,
        ),
      )
      continue
    }
    if (cmd.kind === 'skill') {
      try {
        const { viewSkill } = await import('@xdc-ai/workspace')
        console.log(clip(viewSkill(kit.config.workspaceDir, cmd.name)))
      } catch (error) {
        console.log(pc.red(`  ${error instanceof Error ? error.message : String(error)}`))
      }
      continue
    }
    if (cmd.kind === 'tools') {
      const lister = (agent as { listTools?: (o?: unknown) => Promise<Record<string, unknown>> })
        .listTools
      const tools = lister ? await lister.call(agent) : {}
      const names = Object.keys(tools).sort()
      console.log(names.length ? `  ${names.join('\n  ')}` : pc.dim('  (could not list tools)'))
      console.log(
        pc.dim(
          `  ${names.length} tools · sub-agents appear as agent-<name>; wallet tools appear after xdc-agent login`,
        ),
      )
      continue
    }
    if (cmd.kind === 'wallet') {
      const rows: [string, string][] = [
        ['connected', kit.walletConnected() ? 'yes' : 'no — run xdc-agent login'],
        ['spent today', usdc(await kit.policy.spentToday())],
        ['auto-approve <', usdc(kit.config.policy.autoApproveBelow)],
        ['per-call max', usdc(kit.config.policy.perCallMax)],
        ['daily cap', usdc(kit.config.policy.dailyCap)],
      ]
      if (kit.walletConnected()) {
        try {
          const [addr, bal] = await Promise.all([
            kit.callReadTool('wallet_address'),
            kit.callReadTool('wallet_balance'),
          ])
          rows.push(
            ['address', JSON.stringify(addr).slice(0, 120)],
            ['balances', JSON.stringify(bal).slice(0, 160)],
          )
        } catch (error) {
          rows.push(['balances', pc.red(error instanceof Error ? error.message : String(error))])
        }
      }
      console.log(table(rows))
      continue
    }
    if (cmd.kind === 'memory') {
      const { CuratedMemory } = await import('@xdc-ai/workspace')
      const text = new CuratedMemory(kit.config.workspaceDir).read()
      console.log(
        text.trim()
          ? text.trimEnd()
          : pc.dim(
              '  MEMORY.md is empty — the agent adds facts here with its memory tool; edit it in the dashboard → Memory',
            ),
      )
      continue
    }
    if (cmd.kind === 'usage') {
      console.log(
        table([
          ['last reply', lastUsage ? JSON.stringify(lastUsage) : '—'],
          ['spent today', usdc(await kit.policy.spentToday())],
          ['daily cap', usdc(kit.config.policy.dailyCap)],
        ]),
      )
      continue
    }
    if (cmd.kind === 'routines') {
      try {
        const list = (await mastra.schedules.list()) as {
          id: string
          cron: string
          prompt?: string
          status: string
        }[]
        console.log(
          list.length
            ? list
                .map(
                  (r) =>
                    `  ${pc.yellow(r.id.slice(0, 8))}  ${r.cron.padEnd(14)} ${r.status.padEnd(7)} ${(r.prompt ?? '').slice(0, 70)}`,
                )
                .join('\n')
            : pc.dim('  no routines yet — create them on the dashboard → Routines'),
        )
        const runs = kit.routineRuns.list(5)
        if (runs.length)
          console.log(
            pc.dim('  recent runs:\n') +
              runs
                .map(
                  (r) =>
                    `    ${r.at.slice(0, 16)} ${r.status} ${(r.text ?? r.error ?? '').slice(0, 80)}`,
                )
                .join('\n'),
          )
      } catch (error) {
        console.log(pc.red(`  ${error instanceof Error ? error.message : String(error)}`))
      }
      continue
    }
    if (cmd.kind === 'dashboard') {
      await openDashboard(root)
      continue
    }
    if (cmd.kind === 'retry') {
      if (!lastMessage) {
        console.log(pc.dim('  nothing to retry yet'))
        continue
      }
      console.log(pc.dim(`  retrying: ${lastMessage.slice(0, 80)}`))
    }
    if (cmd.kind === 'unknown') {
      console.log(pc.red(`  unknown command ${cmd.text}`) + pc.dim(' — /help'))
      continue
    }

    const message = cmd.kind === 'retry' ? (lastMessage as string) : cmd.text
    lastMessage = message
    process.stdout.write(pc.magenta('agent › '))
    try {
      const stream = await agent.stream(message, {
        memory: { thread, resource },
      })
      let wrote = false
      for await (const part of stream.textStream) {
        process.stdout.write(part)
        wrote = true
      }
      if (!wrote) process.stdout.write(pc.dim('(no text reply)'))
      process.stdout.write('\n')
      lastUsage = await (stream as { usage?: Promise<unknown> }).usage?.catch(() => undefined)
    } catch (error) {
      console.log(pc.red(`\n  error: ${error instanceof Error ? error.message : String(error)}`))
    }
    await showPending()
  }
  rl.close()
  console.log(pc.dim('bye'))
  process.exit(0)
}

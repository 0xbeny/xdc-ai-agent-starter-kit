import { emitKeypressEvents } from 'node:readline'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

import { join } from 'node:path'

import pc from 'picocolors'

import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import { spawn } from 'node:child_process'

import { banner, createStreamRenderer, statsLine, toolDone, toolLine } from './render.ts'
import { runDashboardCommand } from './dashboard.ts'
import { completeSlash, matchApprovalId, parseSlash, slashHelpLines } from './slash.ts'
import { gracefulExit } from 'exit-hook'

import { runDoctor } from './doctor.ts'
import { installSkill } from './skill-install.ts'
import { ensureServiceRunning, launchdLoaded, launchdState, waitForHttp } from './service.ts'
import { showPairingStatus } from './telegram.ts'
import { loadOrCreateThread, rotateThread } from './thread.ts'

interface ApprovalLike {
  id: string
  tool: string
  kind: string
  reason: string
  status: string
  amount?: bigint
  preview?: string
}

/** Loaded lazily: the agent bundle is heavy and not needed for `setup`/`login`. */
async function loadAgent() {
  const [{ mastra }, { getKit }] = await Promise.all([
    import('../../agent/src/mastra/index.ts'),
    import('../../agent/src/mastra/kit.ts'),
  ])
  return { mastra, agent: mastra.getAgent('assistant'), kit: getKit() }
}

async function gitHead(root: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn('git', ['rev-parse', 'HEAD'], { cwd: root })
    let out = ''
    child.stdout.on('data', (d: Buffer) => (out += d.toString()))
    child.on('exit', () => resolve(out.trim()))
    child.on('error', () => resolve(''))
  })
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
  gracefulExit(0)
}

export async function runChat(): Promise<void> {
  process.stdout.write(pc.dim('starting your agent…\n'))
  const { mastra, agent, kit } = await loadAgent()
  const root = join(kit.config.workspaceDir, '..')
  // The dashboard/Telegram service should be alive without anyone running restart commands.
  if (launchdLoaded() && launchdState()?.running !== true) {
    try {
      ensureServiceRunning(root, true)
      void waitForHttp('http://127.0.0.1:4111/api', 120_000).then((up) => {
        if (up) console.log(pc.dim('  (login service was down — restarted it in the background)'))
      })
    } catch {
      /* doctor will say why */
    }
  }
  // Tools that only make sense from this terminal session (the CLI process can start services; the agent server cannot).
  const localTools = {
    open_dashboard: createTool({
      id: 'open_dashboard',
      description:
        'Start the web dashboard if it is not running and open it for the human (or print the ssh tunnel command when they are on SSH). Use when the human asks to open, run, start or show the dashboard/UI.',
      inputSchema: z.object({}),
      outputSchema: z.object({ ok: z.boolean(), message: z.string() }),
      execute: async () => {
        try {
          await runDashboardCommand(root, ['--no-open'], { background: true })
          return {
            ok: true,
            message:
              'Dashboard is running; the URL (or ssh -L command) was printed in the terminal.',
          }
        } catch (error) {
          return { ok: false, message: error instanceof Error ? error.message : String(error) }
        }
      },
    }),
  }
  let lastMessage: string | undefined
  let lastUsage: unknown
  const resource = `cli:${process.env.USER ?? 'local'}`
  const threadState = loadOrCreateThread(kit.config.dataDir)
  let thread = threadState.thread
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
    banner({
      model: `${name.provider}/${name.model}`,
      wallet: kit.walletConnected(),
      skills: (await import('@xdc-ai/workspace')).listSkills(kit.config.workspaceDir).length,
      pending: (await kit.approvals.list('pending')).length,
      workspace: kit.config.workspaceDir,
    }),
  )

  if (threadState.resumed)
    console.log(pc.dim('  continuing your last conversation — /new starts fresh'))

  const showPending = async (): Promise<void> => {
    const pending = (await kit.approvals.list('pending')) as ApprovalLike[]
    if (pending.length === 0) return
    console.log(
      pc.yellow(
        `\n  ${pending.length} approval${pending.length > 1 ? 's' : ''} waiting — /approvals to review`,
      ),
    )
  }

  await showPending()

  const pendingBefore = new Set<string>((await kit.approvals.list('pending')).map((a) => a.id))

  const runTurn = async (message: string): Promise<void> => {
    console.log(pc.magenta('agent ›'))
    const started = Date.now()
    try {
      const stream = await agent.stream(message, {
        memory: { thread, resource },
        toolsets: { cli: localTools },
      })
      const renderer = createStreamRenderer((t) => process.stdout.write(t))
      const toolStarts = new Map<string, number>()
      const full = (
        stream as {
          fullStream?: AsyncIterable<{ type: string; payload?: Record<string, unknown> }>
        }
      ).fullStream
      if (full) {
        for await (const chunk of full) {
          const p = chunk.payload ?? {}
          if (chunk.type === 'text-delta') {
            const t = (p.text ?? p.textDelta ?? '') as string
            if (t) renderer.push(t)
          } else if (chunk.type === 'tool-call') {
            const toolName = String(p.toolName ?? p.name ?? 'tool')
            toolStarts.set(String(p.toolCallId ?? toolName), Date.now())
            renderer.flush()
            console.log(toolLine(toolName, p.args))
          } else if (chunk.type === 'tool-result') {
            const toolName = String(p.toolName ?? p.name ?? 'tool')
            const t0 = toolStarts.get(String(p.toolCallId ?? toolName))
            const failed =
              p.isError === true ||
              (typeof p.result === 'object' &&
                p.result !== null &&
                (p.result as { ok?: boolean }).ok === false)
            console.log(toolDone(toolName, !failed, t0 !== undefined ? Date.now() - t0 : undefined))
          } else if (chunk.type === 'error') {
            renderer.flush()
            console.log(pc.red(`  error: ${String((p as { error?: unknown }).error ?? 'unknown')}`))
          }
        }
      } else {
        for await (const part of stream.textStream) renderer.push(part)
      }
      const wrote = renderer.flush()
      if (wrote === 0) console.log(pc.dim('  (no text reply)'))
      lastUsage = await (stream as { usage?: Promise<unknown> }).usage?.catch(() => undefined)
      console.log(statsLine(Date.now() - started, lastUsage))
    } catch (error) {
      console.log(pc.red(`\n  error: ${error instanceof Error ? error.message : String(error)}`))
    }
  }

  /** New approvals from the last turn get a y/n right here; the decision goes back to the agent automatically. */
  const promptNewApprovals = async (): Promise<void> => {
    for (let round = 0; round < 3; round++) {
      const fresh = ((await kit.approvals.list('pending')) as ApprovalLike[]).filter(
        (a) => !pendingBefore.has(a.id),
      )
      if (fresh.length === 0) return
      const decisions: string[] = []
      for (const a of fresh) {
        pendingBefore.add(a.id)
        console.log(
          `\n${pc.yellow('⧗ approval needed')} ${pc.dim(a.id.slice(0, 8))} — ${a.reason}${a.amount !== undefined ? pc.bold(` · ${usdc(a.amount)}`) : ''}`,
        )
        if (a.preview) console.log(pc.dim(clip(a.preview, 800).replace(/^/gm, '    ')))
        const ans = await Promise.race([
          rl.question(pc.cyan('  approve? (y/N) › ')).catch(() => null),
          closed,
        ])
        const yes = ans !== null && /^y(es)?$/i.test(ans.trim())
        try {
          await kit.approvals.decide(a.id, yes ? 'approved' : 'denied', 'via chat')
        } catch {
          continue // decided elsewhere in the meantime
        }
        console.log(yes ? pc.green('  ✓ approved') : pc.red('  ✗ denied'))
        decisions.push(`${a.id} ${yes ? 'approved' : 'denied'}`)
      }
      if (decisions.length === 0) return
      await runTurn(
        `[Decided in chat by the human: ${decisions.join('; ')}. For each approved id, call the same tool again with identical arguments plus that approvalId. Do not retry denied items.]`,
      )
    }
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
      thread = rotateThread(kit.config.dataDir)
      console.log(pc.dim('  new conversation (the old one stays in history)'))
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
    if (cmd.kind === 'telegram') {
      const shown = await showPairingStatus({ root, envFile: join(root, '.env') })
      if (!shown)
        console.log(
          pc.dim('  no bot token saved yet — run `xdc-agent telegram` in a terminal to set one up'),
        )
      continue
    }
    if (cmd.kind === 'doctor') {
      await runDoctor(root)
      continue
    }
    if (cmd.kind === 'grants') {
      if (cmd.args[0] === 'revoke' && cmd.args[1]) {
        try {
          console.log(pc.green(`  revoked ${kit.grants.revoke(cmd.args[1]).path}`))
        } catch (error) {
          console.log(pc.red(`  ${error instanceof Error ? error.message : String(error)}`))
        }
      } else {
        const grants = kit.grants.list()
        console.log(
          grants.length
            ? grants.map((g) => `  ${pc.dim(g.id.slice(0, 8))}  ${g.path}`).join('\n') +
                pc.dim('\n  /grants revoke <id> removes one')
            : pc.dim('  no folders granted — the agent asks via folder_request when it needs one'),
        )
      }
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
    if (cmd.kind === 'skill-install') {
      const r = await installSkill(
        {
          workspaceDir: kit.config.workspaceDir,
          confirm: async (meta, content) => {
            console.log(
              `\n${pc.yellow('review before installing')} — ${pc.bold(`${meta.category}/${meta.name}`)}: ${meta.description}`,
            )
            console.log(pc.dim(clip(content, 4000).replace(/^/gm, '    ')))
            console.log(
              pc.dim(
                '  a skill is instructions your agent will follow — only install from authors you trust',
              ),
            )
            const ans = await Promise.race([
              rl.question(pc.cyan('  install? (y/N) › ')).catch(() => null),
              closed,
            ])
            return ans !== null && /^y(es)?$/i.test(ans.trim())
          },
        },
        cmd.url,
        cmd.category,
      )
      console.log(r.ok ? pc.green(`  ${r.message}`) : pc.red(`  ${r.message}`))
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
      const [sub, name] = cmd.args
      if ((sub === 'on' || sub === 'off') && name) {
        kit.toolPolicy.set(name, sub === 'on')
        console.log(
          sub === 'on'
            ? pc.green(`  ${name} enabled (applies from the next turn)`)
            : pc.yellow(`  ${name} disabled (applies from the next turn)`),
        )
        continue
      }
      const lister = (agent as { listTools?: (o?: unknown) => Promise<Record<string, unknown>> })
        .listTools
      const tools = lister ? await lister.call(agent) : {}
      const off = new Set(kit.toolPolicy.disabled())
      const names = [...new Set([...Object.keys(tools), ...off])].sort()
      console.log(
        names.length
          ? names
              .map((n) => (off.has(n) ? pc.red(`  ✗ ${n} (off)`) : pc.green(`  ✓ ${n}`)))
              .join('\n')
          : pc.dim('  (could not list tools)'),
      )
      console.log(
        pc.dim(
          `  ${names.length} tools · /tools off <name> disables one, /tools on <name> re-enables · wallet tools appear after xdc-agent login`,
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
      rl.pause()
      try {
        await runDashboardCommand(root, cmd.args, { background: true })
      } catch (error) {
        console.log(pc.red(`  ${error instanceof Error ? error.message : String(error)}`))
      }
      rl.resume()
      continue
    }
    if (cmd.kind === 'update') {
      const before = await gitHead(root)
      rl.pause()
      const code = await new Promise<number>((resolve) => {
        const child = spawn('bash', [join(root, 'scripts', 'update.sh'), '--no-restart'], {
          cwd: root,
          stdio: 'inherit',
        })
        child.on('exit', (c) => resolve(c ?? 1))
      })
      rl.resume()
      const after = await gitHead(root)
      if (code !== 0) console.log(pc.red('  update did not complete — see the messages above'))
      else if (before === after) console.log(pc.dim('  already up to date'))
      else {
        console.log(pc.green(`  updated ${before.slice(0, 7)} → ${after.slice(0, 7)}`))
        console.log(
          pc.yellow(
            '  this chat is still running the old code: /quit, then start xdc-agent again',
          ) +
            pc.dim(
              ' (the login service restarts itself: xdc-agent update does that outside the chat)',
            ),
        )
      }
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
    await runTurn(message)
    await promptNewApprovals()
  }
  rl.close()
  console.log(pc.dim('bye'))
  gracefulExit(0)
}

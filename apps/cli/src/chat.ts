import { emitKeypressEvents } from 'node:readline'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

import pc from 'picocolors'

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
  return { agent: mastra.getAgent('assistant'), kit: getKit() }
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
  const { agent, kit } = await loadAgent()
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
    if (cmd.kind === 'unknown') {
      console.log(pc.red(`  unknown command ${cmd.text}`) + pc.dim(' — /help'))
      continue
    }

    process.stdout.write(pc.magenta('agent › '))
    try {
      const stream = await agent.stream(cmd.text, { memory: { thread, resource } })
      let wrote = false
      for await (const part of stream.textStream) {
        process.stdout.write(part)
        wrote = true
      }
      if (!wrote) process.stdout.write(pc.dim('(no text reply)'))
      process.stdout.write('\n')
    } catch (error) {
      console.log(pc.red(`\n  error: ${error instanceof Error ? error.message : String(error)}`))
    }
    await showPending()
  }
  rl.close()
  console.log(pc.dim('bye'))
  process.exit(0)
}

import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

import pc from 'picocolors'

import { matchApprovalId, parseSlash } from './slash.ts'

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

const HELP = `
  ${pc.bold('Type a message')} to talk to your agent. Slash commands:
  /new              start a fresh conversation (memory keeps long-term facts)
  /approvals        list pending approvals
  /approve <id>     approve (id or its 8-char prefix)      /deny <id>
  /status           model, wallet, workspace, skills
  /quit             leave (the agent keeps running if started as a service)
`

function fmtApproval(a: ApprovalLike): string {
  const amt = a.amount !== undefined ? ` · ${Number(a.amount) / 1_000_000} USDC` : ''
  return `${pc.yellow(a.id.slice(0, 8))}  ${a.kind}${amt}  ${pc.dim(a.tool)}\n           ${a.reason}`
}

export async function runChat(): Promise<void> {
  process.stdout.write(pc.dim('starting your agent…\n'))
  const { agent, kit } = await loadAgent()
  const resource = `cli:${process.env.USER ?? 'local'}`
  let thread = `cli:${Date.now()}`
  const rl = createInterface({ input: stdin, output: stdout, terminal: stdin.isTTY === true })
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

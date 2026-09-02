import pc from 'picocolors'

/** Light, stream-safe markdown colouring for one completed line. */
export function renderMdLine(line: string): string {
  if (/^\s*```/.test(line))
    return pc.dim(
      line.replace(/```(\w*)/, '┌─ $1').trim() === '┌─'
        ? '└─────'
        : line.replace(/```(\w*)/, '┌─ $1'),
    )
  let out = line
  const h = /^(#{1,4})\s+(.*)$/.exec(out)
  if (h) return pc.bold(pc.cyan(h[2] ?? ''))
  out = out.replace(/^(\s*)[-*]\s+/, (_m, sp: string) => `${sp}${pc.cyan('•')} `)
  out = out.replace(/^(\s*)(\d+)\.\s+/, (_m, sp: string, n: string) => `${sp}${pc.cyan(`${n}.`)} `)
  out = out.replace(/\*\*([^*]+)\*\*/g, (_m, t: string) => pc.bold(t))
  out = out.replace(/`([^`]+)`/g, (_m, t: string) => pc.yellow(t))
  out = out.replace(
    /\[([^\]]+)\]\((https?:[^)]+)\)/g,
    (_m, t: string, u: string) => `${t} ${pc.dim(`(${u})`)}`,
  )
  return out
}

/**
 * Renders a token stream with line-buffered markdown colouring inside a coloured gutter.
 * Returns a flush() to call at the end and the number of characters written.
 */
export function createStreamRenderer(
  write: (s: string) => void,
  gutter = pc.magenta('│ '),
): { push: (text: string) => void; flush: () => number } {
  let buffer = ''
  let inCode = false
  let chars = 0
  let openedLine = false
  const emitLine = (line: string): void => {
    if (/^\s*```/.test(line)) inCode = !inCode
    const rendered = inCode && !/^\s*```/.test(line) ? pc.dim(line) : renderMdLine(line)
    write(`${openedLine ? '' : gutter}${rendered}\n`)
    openedLine = false
  }
  return {
    push(text: string) {
      chars += text.length
      buffer += text
      let idx = buffer.indexOf('\n')
      while (idx >= 0) {
        const line = buffer.slice(0, idx)
        // If we already streamed part of this line raw, just close it plainly.
        if (openedLine) {
          write(`${line}\n`)
          openedLine = false
        } else {
          emitLine(line)
        }
        buffer = buffer.slice(idx + 1)
        idx = buffer.indexOf('\n')
      }
      // Stream long partial lines raw so the user sees progress without waiting for the newline.
      if (buffer.length > 160) {
        write(`${openedLine ? '' : gutter}${buffer}`)
        openedLine = true
        buffer = ''
      }
    },
    flush() {
      if (buffer.length > 0 || openedLine) {
        if (openedLine) write(`${buffer}\n`)
        else emitLine(buffer)
        buffer = ''
        openedLine = false
      }
      return chars
    },
  }
}

export function toolLine(name: string, args?: unknown): string {
  const arg = args === undefined ? '' : ` ${pc.dim(JSON.stringify(args).slice(0, 80))}`
  return `${pc.dim('  ⚙')} ${pc.cyan(name)}${arg}`
}

export function toolDone(name: string, ok: boolean, ms?: number): string {
  return `${ok ? pc.green('  ✓') : pc.red('  ✗')} ${pc.dim(`${name}${ms !== undefined ? ` · ${(ms / 1000).toFixed(1)}s` : ''}`)}`
}

export function banner(opts: {
  model: string
  wallet: boolean
  skills: number
  pending: number
  workspace: string
}): string {
  const chip = (label: string, on: boolean, onText: string, offText: string): string =>
    (on ? pc.green(`● ${onText}`) : pc.dim(`○ ${offText}`)) + pc.dim(` ${label}`)
  const line1 = ` ${pc.bold('xdc-agent')} ${pc.dim('·')} ${pc.cyan(opts.model)}`
  const line2 = ` ${chip('wallet', opts.wallet, 'connected', 'not connected')}  ${pc.dim('·')}  ${pc.dim(`${opts.skills} skills`)}${opts.pending > 0 ? `  ${pc.dim('·')}  ${pc.yellow(`${opts.pending} approvals waiting`)}` : ''}`
  const line3 = ` ${pc.dim(opts.workspace)}`
  const width = 74
  const bar = pc.dim(`╭${'─'.repeat(width)}`)
  const bot = pc.dim(`╰${'─'.repeat(width)}`)
  return [
    bar,
    line1,
    line2,
    line3,
    `${bot}\n ${pc.dim('type a message · / for commands · Tab completes · /quit leaves')}`,
  ].join('\n')
}

export function statsLine(ms: number, usage: unknown): string {
  const u = usage as
    { totalTokens?: number; inputTokens?: number; outputTokens?: number } | undefined
  const tokens =
    u?.totalTokens ??
    (u?.inputTokens !== undefined && u?.outputTokens !== undefined
      ? u.inputTokens + u.outputTokens
      : undefined)
  return pc.dim(
    `  · ${(ms / 1000).toFixed(1)}s${tokens !== undefined ? ` · ${tokens.toLocaleString()} tokens` : ''}`,
  )
}

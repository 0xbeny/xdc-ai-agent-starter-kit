import type { Approval } from '@xdc-ai/xdcai'
import { formatUsdc } from '@xdc-ai/xdcai'

/** Telegram MarkdownV2 escaping. */
export function esc(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`)
}

export function approvalMessage(a: Approval): string {
  const amount = a.amount !== undefined ? ` · ${formatUsdc(a.amount)} USDC` : ''
  const args = JSON.stringify(a.input, null, 1).slice(0, 900)
  return [
    `*Approval needed* — ${esc(a.kind)}${esc(amount)}`,
    `Tool: \`${esc(a.tool)}\``,
    esc(a.reason),
    '```',
    esc(args),
    '```',
    `id \`${esc(a.id.slice(0, 8))}\``,
  ].join('\n')
}

/** Splits long agent replies to Telegram's 4096-char limit on paragraph boundaries. */
export function chunk(text: string, max = 4000): string[] {
  if (text.length <= max) return [text]
  const out: string[] = []
  let rest = text
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n\n', max)
    if (cut < max / 2) cut = rest.lastIndexOf('\n', max)
    if (cut < max / 2) cut = max
    out.push(rest.slice(0, cut))
    rest = rest.slice(cut).replace(/^\n+/, '')
  }
  if (rest) out.push(rest)
  return out
}

/**
 * Command policy for the sandbox tool. The sandbox itself provides isolation (Seatbelt / bwrap,
 * no network by default); this list stops the obviously destructive or exfiltrating intents
 * before they run, and explains why, so the agent can ask the human instead.
 */
export type CommandVerdict = { ok: true } | { ok: false; reason: string }

const DENY: { re: RegExp; reason: string }[] = [
  { re: /\bsudo\b|\bsu\s+-/, reason: 'privilege escalation is never allowed in the sandbox' },
  {
    re: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)[a-zA-Z]*\s+(\/|~|\$HOME|\.\.)(\s|$|\/)/,
    reason: 'recursive delete of a root, home or parent path',
  },
  { re: /\b(mkfs|fdisk|diskutil\s+erase|dd\s+if=)/, reason: 'disk-level operations' },
  {
    re: /\b(shutdown|reboot|halt|launchctl\s+(unload|bootout)|systemctl\s+(stop|disable))\b/,
    reason: 'host power or service control',
  },
  { re: /(curl|wget)[^|]*\|\s*(ba|z|)sh\b/, reason: 'piping a download into a shell' },
  {
    re: /\bgit\s+push\b.*(--force|-f\b)/,
    reason: 'force-push rewrites shared history; ask the human',
  },
  {
    re: /\b(chmod|chown)\s+(-R\s+)?[0-7]*\s*\/(\s|$)/,
    reason: 'permission changes on the filesystem root',
  },
  { re: /\bcrontab\s+-r\b/, reason: 'wiping crontab' },
  { re: /:\(\)\s*\{\s*:\|:&\s*\};:/, reason: 'fork bomb' },
  { re: /\b(nc|ncat|netcat)\b.*\s-e\s/, reason: 'reverse shell' },
  { re: /\b(ssh|scp|rsync)\s+[^\s]*@/, reason: 'remote host access; ask the human' },
  {
    re: /\.(env|pem|key)\b.*\|\s*(curl|wget|nc)\b|\b(curl|wget)\b.*(\.env|id_rsa|\.pem)/,
    reason: 'looks like secret exfiltration',
  },
]

export function classifyCommand(command: string): CommandVerdict {
  const c = command.trim()
  if (c === '') return { ok: false, reason: 'empty command' }
  if (c.length > 4000) return { ok: false, reason: 'command too long' }
  for (const { re, reason } of DENY) if (re.test(c)) return { ok: false, reason }
  return { ok: true }
}

/** Trim output so a chatty command cannot blow the context window. */
export function clipOutput(text: string, max = 12_000): string {
  if (text.length <= max) return text
  const head = text.slice(0, Math.floor(max * 0.7))
  const tail = text.slice(-Math.floor(max * 0.25))
  return `${head}\n\n[... ${text.length - head.length - tail.length} characters omitted ...]\n\n${tail}`
}

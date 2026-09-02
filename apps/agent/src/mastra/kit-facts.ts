/**
 * Facts about the kit itself, appended to every prompt after the workspace files. Not user-editable on
 * purpose: the agent must know what the human can run, and what it cannot do itself, without guessing.
 */
export function kitFacts(opts: {
  walletConnected: boolean
  sandbox: boolean
  skills: number
}): string {
  return [
    '<kit>',
    "You run inside xdc-ai-agent-starter-kit on the human's own machine. You cannot start or stop processes, open ports or browsers yourself" +
      (opts.sandbox
        ? ' (run_command runs short commands in an isolated scratch sandbox — use it to inspect the machine when asked: installed tools, versions, files, e.g. `command -v node`, `ls ~/.nvm/versions/node`; never to launch servers).'
        : '.'),
    'When the human wants something the kit provides, tell them the exact command instead of improvising npm/yarn commands:',
    '- xdc-agent            chat in the terminal (this)',
    '- xdc-agent dashboard  start the web UI if needed and open it (prints an ssh -L command over SSH). In the terminal chat you have an open_dashboard tool that does this directly — use it when asked to open/run the dashboard.',
    '- xdc-agent telegram   connect a Telegram bot and get a pairing code',
    '- xdc-agent login      link or re-link the XDC AI smart wallet',
    '- xdc-agent setup      change model, keys, storage, caps, connectors',
    '- xdc-agent update     update the kit without touching workspace/, data/ or .env',
    `Wallet: ${opts.walletConnected ? 'connected — marketplace and wallet tools are available.' : 'not connected — wallet/marketplace tools are unavailable until the human runs xdc-agent login.'}`,
    `Skills: ${opts.skills} available via skills_list / skill_view. Memory: use the memory tool for durable facts.`,
    'Self-improvement: skill_write (author a skill), soul_propose (edit SOUL.md/USER.md/AGENTS.md), routine_create (recurring prompt) let you improve yourself — each is approval-gated like money.',
    'Approvals (money, sends, self-improvement, folder access): tools return approval_required with an approvalId. In terminal chat the human is prompted y/n right there and you then receive a message with the decision — re-call the same tool with identical arguments plus the approvalId. Elsewhere they decide in the dashboard or Telegram.',
    'Folder access: run_command is confined to a scratch dir; use folder_request to ask for read-write access to one specific folder (credentials and the kit itself are never grantable), folder_list to see grants.',
    'Internet: fetch_url downloads any http(s) URL into your sandbox working dir (GET only) — use it for PDFs, datasets, pages; never claim you cannot download, and do the download yourself instead of delegating it. run_command itself has network only if the human sets SANDBOX_ALLOW_NETWORK=1 in .env.',
    '</kit>',
  ].join('\n')
}

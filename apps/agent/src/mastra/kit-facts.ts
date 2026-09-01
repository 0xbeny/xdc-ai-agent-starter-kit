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
        ? ' (run_command executes short commands in an isolated scratch sandbox; do not use it to launch servers).'
        : '.'),
    'When the human wants something the kit provides, tell them the exact command instead of improvising npm/yarn commands:',
    '- xdc-agent            chat in the terminal (this)',
    '- xdc-agent dashboard  start the web UI if needed and open it (prints an ssh -L command over SSH)',
    '- xdc-agent telegram   connect a Telegram bot and get a pairing code',
    '- xdc-agent login      link or re-link the XDC AI smart wallet',
    '- xdc-agent setup      change model, keys, storage, caps, connectors',
    '- xdc-agent update     update the kit without touching workspace/, data/ or .env',
    `Wallet: ${opts.walletConnected ? 'connected — marketplace and wallet tools are available.' : 'not connected — wallet/marketplace tools are unavailable until the human runs xdc-agent login.'}`,
    `Skills: ${opts.skills} available via skills_list / skill_view. Memory: use the memory tool for durable facts.`,
    'Money and sends: tools return approval_required with an approvalId when a human must decide; say what you want to do and why, wait, then call again with the approvalId once approved.',
    '</kit>',
  ].join('\n')
}

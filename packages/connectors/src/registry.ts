export type ToolClass = 'read' | 'write' | 'send'

export interface ConnectorDef {
  id: string
  label: string
  group?: string
  description: string
  /** Remote MCP endpoint (Streamable HTTP). */
  url: string
  /** OAuth scopes to request when the server supports them. */
  scopes?: string[]
  /** Env prefix for a pre-registered OAuth client, e.g. GOOGLE → GOOGLE_OAUTH_CLIENT_ID / _SECRET. */
  clientEnvPrefix?: string
  /** Vendor does dynamic client registration; no pre-registered client needed. */
  supportsDcr?: boolean
  /** Tool-name patterns that escalate the approval class; anything else is `read`. */
  classify?: { send?: RegExp[]; write?: RegExp[] }
  status?: 'ga' | 'preview'
}

const GOOGLE = {
  group: 'Google Workspace',
  clientEnvPrefix: 'GOOGLE',
  status: 'preview' as const,
}

export const CONNECTORS: ConnectorDef[] = [
  {
    id: 'slack',
    label: 'Slack',
    description: 'Search messages, files and people; read threads; post messages; canvases.',
    url: 'https://mcp.slack.com/mcp',
    supportsDcr: true,
    classify: {
      send: [/send|post|reply|publish/i],
      write: [/create|update|delete|edit|archive|invite|set_/i],
    },
    status: 'ga',
  },
  {
    ...GOOGLE,
    id: 'gmail',
    label: 'Gmail',
    description: 'Search and read mail; draft replies. Sending is always previewed.',
    url: 'https://gmailmcp.googleapis.com/mcp/v1',
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.compose',
    ],
    classify: {
      send: [/send/i],
      write: [/create|draft|update|delete|modify|label|trash|archive/i],
    },
  },
  {
    ...GOOGLE,
    id: 'drive',
    label: 'Google Drive',
    description: 'Find and read files; upload or organise with approval.',
    url: 'https://drivemcp.googleapis.com/mcp/v1',
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.file',
    ],
    classify: {
      send: [/share|permission/i],
      write: [/create|upload|update|delete|move|copy|rename|trash/i],
    },
  },
  {
    ...GOOGLE,
    id: 'calendar',
    label: 'Google Calendar',
    description: 'List events and free time; schedule with approval; invites are previewed.',
    url: 'https://calendarmcp.googleapis.com/mcp/v1',
    scopes: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
    ],
    classify: {
      send: [/invite|attendee|send/i],
      write: [/create|insert|update|patch|delete|move/i],
    },
  },
  {
    ...GOOGLE,
    id: 'docs',
    label: 'Google Docs',
    description: 'Read documents; create and edit with approval.',
    url: 'https://docsmcp.googleapis.com/mcp/v1',
    scopes: [
      'https://www.googleapis.com/auth/documents.readonly',
      'https://www.googleapis.com/auth/drive.file',
    ],
    classify: { write: [/create|insert|update|delete|replace|batch/i] },
  },
  {
    ...GOOGLE,
    id: 'sheets',
    label: 'Google Sheets',
    description: 'Read ranges; append and update with approval.',
    url: 'https://sheetsmcp.googleapis.com/mcp/v1',
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets.readonly',
      'https://www.googleapis.com/auth/drive.file',
    ],
    classify: { write: [/create|append|update|clear|delete|batch|write/i] },
  },
  {
    id: 'notion',
    label: 'Notion',
    description: 'Search and read pages and databases; create or update with approval.',
    url: 'https://mcp.notion.com/mcp',
    supportsDcr: true,
    classify: { write: [/create|update|delete|append|move|archive|comment/i] },
    status: 'ga',
  },
  {
    id: 'github',
    label: 'GitHub',
    description: 'Repos, issues, pull requests and code search; writes need approval.',
    url: 'https://api.githubcopilot.com/mcp/',
    supportsDcr: true,
    classify: {
      send: [/merge|dispatch|publish|release/i],
      write: [/create|update|delete|push|comment|assign|label|close|fork|add_/i],
    },
    status: 'ga',
  },
  {
    id: 'linear',
    label: 'Linear',
    description: 'Issues, projects and cycles; writes need approval.',
    url: 'https://mcp.linear.app/mcp',
    supportsDcr: true,
    classify: { write: [/create|update|delete|assign|comment|archive/i] },
    status: 'ga',
  },
]

export function connectorById(id: string): ConnectorDef | undefined {
  return CONNECTORS.find((c) => c.id === id)
}

/** read → automatic · write → approval · send/external → approval with preview. */
export function classifyTool(def: Pick<ConnectorDef, 'classify'>, toolName: string): ToolClass {
  const name = toolName.replace(/^[a-z0-9-]+_/i, '') // strip only the serverName_ prefix Mastra adds
  if (def.classify?.send?.some((re) => re.test(name))) return 'send'
  if (def.classify?.write?.some((re) => re.test(name))) return 'write'
  return 'read'
}

/** Pre-registered client from env (GOOGLE_OAUTH_CLIENT_ID etc.), when the vendor needs one. */
export function clientFromEnv(
  def: ConnectorDef,
  env: Readonly<Record<string, string | undefined>>,
): { client_id: string; client_secret?: string } | undefined {
  const prefix = def.clientEnvPrefix ?? def.id.toUpperCase().replace(/-/g, '_')
  const id = env[`${prefix}_OAUTH_CLIENT_ID`]?.trim()
  if (!id) return undefined
  const secret = env[`${prefix}_OAUTH_CLIENT_SECRET`]?.trim()
  return secret ? { client_id: id, client_secret: secret } : { client_id: id }
}

import { describe, expect, it } from 'vitest'

import { classifyTool, clientFromEnv, connectorById, CONNECTORS } from './registry.ts'

describe('registry', () => {
  it('ships the day-one connectors', () => {
    const ids = CONNECTORS.map((c) => c.id)
    for (const id of ['slack', 'gmail', 'drive', 'calendar', 'notion', 'github'])
      expect(ids).toContain(id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const c of CONNECTORS) expect(c.url.startsWith('https://')).toBe(true)
  })

  it('classifies tools conservatively', () => {
    const slack = connectorById('slack')!
    expect(classifyTool(slack, 'slack_search_messages')).toBe('read')
    expect(classifyTool(slack, 'slack_send_message')).toBe('send')
    expect(classifyTool(slack, 'slack_create_canvas')).toBe('write')
    const gmail = connectorById('gmail')!
    expect(classifyTool(gmail, 'gmail_create_draft')).toBe('write')
    expect(classifyTool(gmail, 'gmail_send_message')).toBe('send')
    expect(classifyTool(gmail, 'gmail_list_threads')).toBe('read')
    expect(classifyTool({}, 'anything_at_all')).toBe('read')
  })

  it('reads a pre-registered client from env by prefix', () => {
    const gmail = connectorById('gmail')!
    expect(clientFromEnv(gmail, {})).toBeUndefined()
    expect(
      clientFromEnv(gmail, { GOOGLE_OAUTH_CLIENT_ID: 'id', GOOGLE_OAUTH_CLIENT_SECRET: 's' }),
    ).toEqual({ client_id: 'id', client_secret: 's' })
    expect(clientFromEnv(connectorById('slack')!, { SLACK_OAUTH_CLIENT_ID: 'x' })).toEqual({
      client_id: 'x',
    })
  })
})

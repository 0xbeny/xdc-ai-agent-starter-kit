import { join } from 'node:path'

import type { MCPClient } from '@mastra/mcp'
import {
  type Catalog,
  createXdcaiMcp,
  createXdcaiTools,
  defaultLoadCatalog,
  FileAuthStore,
  hasWalletSession,
  JsonlApprovalStore,
  JsonlLedger,
  PaymentPolicy,
} from '@xdc-ai/xdcai'

import {
  ConnectorAuthProvider,
  connectorById,
  CONNECTORS,
  connectorStore,
  createConnectorMcp,
  createConnectorTools,
  type ConnectorDef,
} from '@xdc-ai/connectors'

import { type AgentConfig, loadConfig } from './config.ts'

/** Process-wide singletons shared by the agent and the kit API. */
export class Kit {
  readonly config: AgentConfig
  readonly authStore: FileAuthStore
  readonly ledger: JsonlLedger
  readonly policy: PaymentPolicy
  readonly approvals: JsonlApprovalStore
  private mcp: MCPClient | undefined
  private tools: Promise<Record<string, unknown>> | undefined
  private catalog: Catalog | undefined
  private connectorTools = new Map<string, Promise<Record<string, unknown>>>()

  constructor(config: AgentConfig = loadConfig()) {
    this.config = config
    this.authStore = new FileAuthStore(config.authFile)
    this.ledger = new JsonlLedger(config.ledgerFile)
    this.policy = new PaymentPolicy(config.policy, this.ledger)
    this.approvals = new JsonlApprovalStore(join(config.dataDir, 'approvals.jsonl'))
  }

  walletConnected(): boolean {
    return hasWalletSession(this.authStore)
  }

  getMcp(): MCPClient | undefined {
    if (!this.walletConnected()) return undefined
    this.mcp ??= createXdcaiMcp(this.authStore)
    return this.mcp
  }

  /** xdcai tools wrapped with the payment policy; empty until a wallet session exists. */
  xdcaiTools(): Promise<Record<string, unknown>> {
    this.tools ??= (async () => {
      const mcp = this.getMcp()
      if (!mcp) {
        console.info(
          '[agent] XDC AI wallet not connected — run `pnpm setup` to enable marketplace and wallet tools',
        )
        return {}
      }
      try {
        const tools = await createXdcaiTools({
          mcp,
          policy: this.policy,
          approvals: this.approvals,
          loadCatalog: async (raw) => {
            this.catalog = await defaultLoadCatalog(raw)
            return this.catalog
          },
        })
        console.info(`[agent] xdcai tools: ${Object.keys(tools).length}`)
        return tools
      } catch (error) {
        console.warn(
          `[agent] xdcai tools unavailable: ${error instanceof Error ? error.message : String(error)}`,
        )
        this.tools = undefined
        return {}
      }
    })()
    return this.tools
  }

  /** Marketplace catalog (loaded as a side effect of tool setup). */
  async getCatalog(): Promise<Catalog | undefined> {
    if (!this.catalog) await this.xdcaiTools()
    return this.catalog
  }

  /** Runs a read-only xdcai MCP tool directly (wallet_address, wallet_balance, …). */
  async callReadTool(name: string, input: Record<string, unknown> = {}): Promise<unknown> {
    const tools = (await this.xdcaiTools()) as Record<
      string,
      { execute?: (i: unknown) => Promise<unknown> }
    >
    const tool = tools[`xdcai_${name}`]
    if (!tool?.execute) throw new Error(`xdcai tool ${name} unavailable`)
    return tool.execute(input)
  }

  agentUrl(): string {
    return (this.config.env.AGENT_URL?.trim() || 'http://localhost:4111').replace(/\/$/, '')
  }

  /** Connectors the user enabled in setup (CONNECTORS env) or all known ones when unset. */
  enabledConnectors(): ConnectorDef[] {
    const wanted = (this.config.env.CONNECTORS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (wanted.length === 0) return CONNECTORS
    const GROUPS: Record<string, string[]> = {
      google: ['gmail', 'drive', 'calendar', 'docs', 'sheets'],
    }
    const ids = new Set(wanted.flatMap((w) => GROUPS[w] ?? [w]))
    return CONNECTORS.filter((c) => ids.has(c.id))
  }

  connectorProvider(id: string): ConnectorAuthProvider {
    const def = connectorById(id)
    if (!def) throw new Error(`Unknown connector ${id}`)
    return new ConnectorAuthProvider(
      def,
      connectorStore(this.config.dataDir, id),
      `${this.agentUrl()}/kit/connectors/${id}/callback`,
      this.config.env,
    )
  }

  connectorConnected(id: string): boolean {
    return Boolean(connectorStore(this.config.dataDir, id).read().tokens?.access_token)
  }

  /** Tools from every connected connector, wrapped with the read/write/send approval classes. */
  async connectorToolsAll(): Promise<Record<string, unknown>> {
    const merged: Record<string, unknown> = {}
    for (const def of this.enabledConnectors()) {
      if (!this.connectorConnected(def.id)) continue
      if (!this.connectorTools.has(def.id)) {
        this.connectorTools.set(
          def.id,
          createConnectorTools({
            def,
            mcp: createConnectorMcp(this.connectorProvider(def.id)),
            approvals: this.approvals,
          }).catch((error: unknown) => {
            console.warn(
              `[agent] connector ${def.id} unavailable: ${error instanceof Error ? error.message : String(error)}`,
            )
            this.connectorTools.delete(def.id)
            return {}
          }),
        )
      }
      Object.assign(merged, await this.connectorTools.get(def.id))
    }
    return merged
  }

  async connectorToolCount(id: string): Promise<number | undefined> {
    const p = this.connectorTools.get(id)
    return p ? Object.keys(await p).length : undefined
  }

  resetConnector(id: string): void {
    this.connectorTools.delete(id)
  }

  /** Reset cached MCP state (after login/logout). */
  reset(): void {
    this.mcp = undefined
    this.tools = undefined
    this.catalog = undefined
  }
}

let shared: Kit | undefined
export function getKit(): Kit {
  shared ??= new Kit()
  return shared
}

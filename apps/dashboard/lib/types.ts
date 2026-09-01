export interface KitStatus {
  version: string
  model: { chat: string; fast: string; embed?: string }
  missingKeys: string[]
  workspace: {
    dir: string
    files: { name: string; chars: number; truncated: boolean }[]
    missing: string[]
    bootstrap: boolean
  }
  wallet: { connected: boolean }
  policy: {
    autoApproveBelow: string
    perCallMax: string
    dailyCap: string
    allowedProviders?: string[]
  }
  spentToday: string
  pendingApprovals: number
  connectors: { id: string; label: string; connected: boolean }[]
}

export interface LedgerRow {
  id: string
  at: string
  kind: 'call' | 'transfer' | 'defi'
  amount: string
  status: 'pending' | 'settled' | 'failed'
  provider?: string
  capability?: string
  url?: string
  txHash?: string
  note?: string
}

export interface Approval {
  id: string
  createdAt: string
  status: 'pending' | 'approved' | 'denied' | 'consumed' | 'expired'
  tool: string
  kind: 'call' | 'transfer' | 'defi' | 'connector'
  amount?: string
  reason: string
  input: Record<string, unknown>
  preview?: string
  decidedAt?: string
  note?: string
  threadId?: string
}

export interface MarketplaceEntry {
  id: string
  provider: string
  capability: string
  method: string
  url: string
  price: string
  tags: string[]
  calls: number
  volumeUsdc: number
}

export interface WalletInfo {
  connected: boolean
  address?: string
  xdcAddress?: string
  balances?: Record<string, string>
  error?: string
}

export interface ConnectorInfo {
  id: string
  label: string
  description: string
  connected: boolean
  toolCount?: number
  scopes?: string[]
  needsClientCredentials?: boolean
}

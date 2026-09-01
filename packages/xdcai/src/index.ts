export { AddressError, isXdcOrHexAddress, toHexAddress, toXdcAddress } from './address.ts'
export { Catalog, parseCatalog, parsePrice } from './catalog.ts'
export type { CatalogEntry } from './catalog.ts'
export { addressUrl, txUrl, USDC, XDC_CHAIN_ID, XDCAI, xdcMainnet } from './chain.ts'
export { JsonlLedger, MemoryLedger } from './ledger.ts'
export type { Ledger, LedgerEntry, LedgerStatus, SpendKind } from './ledger.ts'
export {
  DEFAULT_POLICY,
  idempotencyKey,
  latestById,
  PaymentPolicy,
  startOfUtcDay,
} from './policy.ts'
export type { Decision, PolicyConfig, SpendIntent } from './policy.ts'
export { formatUsdc, parseUsdc, UsdcError } from './usdc.ts'
export {
  CLIENT_METADATA,
  deviceLogin,
  FileAuthStore,
  tokensAreFresh,
  XdcaiAuthError,
  XdcaiOAuthProvider,
} from './auth.ts'
export type { DeviceCodeInfo, DeviceLoginOptions, StoredAuth, StoredTokens } from './auth.ts'
export { extractPaymentFacts, guard, MONEY_TOOLS } from './guard.ts'
export type { Guarded, GuardDeps, GuardedExecution, PaymentFacts } from './guard.ts'
export {
  createXdcaiMcp,
  createXdcaiTools,
  defaultLoadCatalog,
  hasWalletSession,
  XDCAI_SERVER_NAME,
} from './mcp.ts'
export type { XdcaiToolsOptions } from './mcp.ts'
export { APPROVAL_TTL_MS, ApprovalError, JsonlApprovalStore, sameInput } from './approvals.ts'
export type { Approval, ApprovalKind, ApprovalStatus, ApprovalStore } from './approvals.ts'

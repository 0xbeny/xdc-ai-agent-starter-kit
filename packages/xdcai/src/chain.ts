import { defineChain } from 'viem'

export const XDC_CHAIN_ID = 50

export const xdcMainnet = defineChain({
  id: XDC_CHAIN_ID,
  name: 'XDC Network',
  nativeCurrency: { name: 'XDC', symbol: 'XDC', decimals: 18 },
  rpcUrls: {
    default: {
      http: ['https://erpc.xinfin.network', 'https://rpc.xdc.org'],
      webSocket: ['wss://ws.xinfin.network'],
    },
  },
  blockExplorers: { default: { name: 'XDCScan', url: 'https://xdcscan.com' } },
})

export const USDC = {
  address: '0xfA2958CB79b0491CC627c1557F441eF849Ca8eb1',
  symbol: 'USDC',
  decimals: 6,
} as const

export const XDCAI = {
  site: 'https://xdcai.tech',
  api: 'https://api.xdcai.tech',
  mcpUrl: 'https://api.xdcai.tech/mcp',
  authorizationServer: 'https://xdcai.tech',
} as const

export const txUrl = (hash: string): string => `${xdcMainnet.blockExplorers.default.url}/tx/${hash}`
export const addressUrl = (address: string): string =>
  `${xdcMainnet.blockExplorers.default.url}/address/${address}`

import { describe, expect, it } from 'vitest'

import { Catalog, parseCatalog, parsePrice } from './catalog.ts'

// shape copied from api.xdcai.tech get_service_info / marketplace_list
const SAMPLE = [
  {
    id: 'gw_b9e57cfbf06bc85f32:/api/quiz/:id',
    provider: 'Learn402 Solidity',
    capability: 'generate a Solidity recall quiz',
    price: '0.01 USDC',
    method: 'GET',
    url: 'https://api.xdcai.tech/x402/connect/gw_b9e57cfbf06bc85f32/api/quiz/:id',
    payTo: '0xb05a8081833e54CC4D8D8e138cEaC440b3CC2a95',
    tags: ['education', 'solidity'],
    calls: 12,
    volumeUSDC: 0.12,
  },
  {
    id: 'gw_ee72d07583c70aa0a6:/gas',
    provider: 'Gas Tracker',
    capability: 'xdc.network.gas',
    price: '0 USDC',
    method: 'GET',
    url: 'https://api.xdcai.tech/x402/connect/gw_ee72d07583c70aa0a6/gas',
    tags: ['xdc', 'gas'],
    calls: 3,
    volumeUSDC: 0,
  },
  {
    id: 'gw_f27bfcecf4eafd6e27:/v1/node/batch-status',
    provider: 'NodeLens XDC Node Intelligence ',
    capability: 'Status for up to 20 masternodes in one call',
    price: '0.25 USDC',
    method: 'GET',
    url: 'https://api.xdcai.tech/x402/connect/gw_f27bfcecf4eafd6e27/v1/node/batch-status',
    tags: ['xdc', 'masternode'],
    calls: 0,
    volumeUSDC: 0,
  },
  { id: 'broken', provider: 'X', price: 'free', method: 'GET', url: 'https://api.xdcai.tech/x' },
  { id: 'no-url', provider: 'X', price: '0.1 USDC', method: 'GET' },
]

describe('parsePrice', () => {
  it.each([
    ['0.01 USDC', 10_000n],
    ['0 USDC', 0n],
    ['0.25', 250_000n],
    [{ usdc: '0.0001', atomic: '100' }, 100n],
    [{ atomic: '300' }, 300n],
  ])('%j → %s', (input, micro) => {
    expect(parsePrice(input)).toBe(micro)
  })
})

describe('parseCatalog', () => {
  it('keeps well-formed entries, trims provider names, drops broken ones', () => {
    const entries = parseCatalog(SAMPLE)
    expect(entries.map((e) => e.id)).toEqual([
      'gw_b9e57cfbf06bc85f32:/api/quiz/:id',
      'gw_ee72d07583c70aa0a6:/gas',
      'gw_f27bfcecf4eafd6e27:/v1/node/batch-status',
    ])
    expect(entries[2]?.provider).toBe('NodeLens XDC Node Intelligence')
    expect(entries[0]?.price).toBe(10_000n)
  })
})

describe('Catalog.find', () => {
  const catalog = Catalog.from(SAMPLE)

  it('matches exact URLs and ignores the query string', () => {
    expect(
      catalog.find('https://api.xdcai.tech/x402/connect/gw_ee72d07583c70aa0a6/gas')?.provider,
    ).toBe('Gas Tracker')
    expect(
      catalog.find('https://api.xdcai.tech/x402/connect/gw_ee72d07583c70aa0a6/gas?x=1')?.provider,
    ).toBe('Gas Tracker')
  })

  it('matches :param templates against concrete paths', () => {
    const hit = catalog.find(
      'https://api.xdcai.tech/x402/connect/gw_b9e57cfbf06bc85f32/api/quiz/42',
    )
    expect(hit?.capability).toMatch(/quiz/)
    expect(
      catalog.find('https://api.xdcai.tech/x402/connect/gw_b9e57cfbf06bc85f32/api/quiz/42/extra'),
    ).toBeUndefined()
  })

  it('returns undefined for unknown URLs or methods', () => {
    expect(catalog.find('https://elsewhere.example/x')).toBeUndefined()
    expect(
      catalog.find('https://api.xdcai.tech/x402/connect/gw_ee72d07583c70aa0a6/gas', 'POST'),
    ).toBeUndefined()
  })
})

describe('Catalog.search', () => {
  it('ranks by matched terms then usage', () => {
    const results = Catalog.from(SAMPLE).search('xdc, masternode')
    expect(results[0]?.provider).toMatch(/NodeLens/)
    expect(results.map((r) => r.provider)).toContain('Gas Tracker')
  })
})

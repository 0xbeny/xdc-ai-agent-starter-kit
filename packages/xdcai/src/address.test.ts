import { describe, expect, it } from 'vitest'

import { AddressError, isXdcOrHexAddress, toHexAddress, toXdcAddress } from './address.ts'

const USDC = '0xfA2958CB79b0491CC627c1557F441eF849Ca8eb1'

describe('address normalisation', () => {
  it('converts xdc prefix to checksummed 0x', () => {
    expect(toHexAddress('xdcfa2958cb79b0491cc627c1557f441ef849ca8eb1')).toBe(USDC)
    expect(toHexAddress('XDCfa2958cb79b0491cc627c1557f441ef849ca8eb1')).toBe(USDC)
  })

  it('checksums a lowercase 0x address', () => {
    expect(toHexAddress(USDC.toLowerCase())).toBe(USDC)
  })

  it('round-trips to the xdc form', () => {
    expect(toXdcAddress(USDC)).toBe('xdcfA2958CB79b0491CC627c1557F441eF849Ca8eb1')
    expect(toHexAddress(toXdcAddress(USDC))).toBe(USDC)
  })

  it('rejects garbage', () => {
    expect(() => toHexAddress('xdc123')).toThrow(AddressError)
    expect(() => toHexAddress('0xZZ')).toThrow(AddressError)
    expect(isXdcOrHexAddress('nope')).toBe(false)
    expect(isXdcOrHexAddress(USDC)).toBe(true)
  })
})

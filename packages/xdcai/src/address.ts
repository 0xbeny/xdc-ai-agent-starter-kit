import { getAddress, isAddress } from 'viem'

export class AddressError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AddressError'
  }
}

/** Accepts `0x…` or `xdc…` and returns the EIP-55 checksummed `0x` form (what RPC, viem and ethers need). */
export function toHexAddress(input: string): `0x${string}` {
  const raw = input.trim()
  const hex = raw.toLowerCase().startsWith('xdc') ? `0x${raw.slice(3)}` : raw
  if (!isAddress(hex, { strict: false }))
    throw new AddressError(`"${input}" is not a valid XDC/EVM address`)
  return getAddress(hex)
}

/** The `xdc`-prefixed form XDC explorers and wallets display. */
export function toXdcAddress(input: string): string {
  return `xdc${toHexAddress(input).slice(2)}`
}

export function isXdcOrHexAddress(input: string): boolean {
  try {
    toHexAddress(input)
    return true
  } catch {
    return false
  }
}

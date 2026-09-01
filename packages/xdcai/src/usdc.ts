import { USDC } from './chain.ts'

export class UsdcError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UsdcError'
  }
}

const SCALE = 10n ** BigInt(USDC.decimals)

/** "0.05" → 50000n (micro-USDC). Exact decimal parsing; never floats. */
export function parseUsdc(input: string | number): bigint {
  const text = typeof input === 'number' ? input.toString() : input.trim().replace(/\s*usdc$/i, '')
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text)
  if (!match) throw new UsdcError(`"${input}" is not a valid non-negative USDC amount`)
  const whole = match[1] ?? '0'
  const frac = match[2] ?? ''
  if (frac.length > USDC.decimals) {
    throw new UsdcError(`USDC has ${USDC.decimals} decimals; "${input}" has ${frac.length}`)
  }
  return BigInt(whole) * SCALE + BigInt(frac.padEnd(USDC.decimals, '0') || '0')
}

/** 50000n → "0.05" (trailing zeros trimmed, at least one decimal digit kept for < 1). */
export function formatUsdc(micro: bigint): string {
  if (micro < 0n) return `-${formatUsdc(-micro)}`
  const whole = micro / SCALE
  const frac = (micro % SCALE).toString().padStart(USDC.decimals, '0').replace(/0+$/, '')
  return frac === '' ? whole.toString() : `${whole}.${frac}`
}

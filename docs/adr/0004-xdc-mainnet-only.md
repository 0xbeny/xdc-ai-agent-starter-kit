# 0004 — XDC mainnet only

Status: accepted · 2026-09-01

## Context

xdcai.tech smart wallets and USDC settlement exist on XDC mainnet (chain 50). There is no supported testnet flow with test USDC.

## Decision

The kit targets XDC mainnet only. No Apothem/testnet mode is offered.

## Consequences

- Every money path is real from the first run, so the payment policy (caps, approvals, idempotency, verify-before-retry) and its tests are non-negotiable and land before any paid tool is enabled.
- Setup makes the human choose a daily cap and an auto-approve threshold explicitly; defaults are conservative (e.g. 0.05 USDC per call auto-approved, 2 USDC per day).
- Chain constants: id 50, RPC `https://erpc.xinfin.network` / `https://rpc.xdc.org`, USDC `0xfA2958CB79b0491CC627c1557F441eF849Ca8eb1` (6 decimals), explorer `https://xdcscan.com`.

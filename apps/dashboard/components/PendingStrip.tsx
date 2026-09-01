'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import type { Approval } from '@/lib/types.ts'

/** Polls pending approvals so a request raised mid-conversation shows up without leaving the chat. */
export function PendingStrip() {
  const [pending, setPending] = useState<Approval[]>([])
  useEffect(() => {
    let alive = true
    const tick = async () => {
      try {
        const res = await fetch('/api/kit/approvals?status=pending', { cache: 'no-store' })
        if (res.ok && alive) setPending(((await res.json()) as { approvals: Approval[] }).approvals)
      } catch {
        /* agent offline; keep last state */
      }
    }
    void tick()
    const id = setInterval(tick, 4000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])
  if (pending.length === 0) return null
  return (
    <Link
      href="/approvals"
      className="card mb-3 flex items-center justify-between border-warn text-sm hover:bg-warn-bg"
    >
      <span>
        <b>{pending.length}</b> approval{pending.length > 1 ? 's' : ''} waiting:{' '}
        <span className="mono">{pending.map((p) => p.tool).join(', ')}</span>
      </span>
      <span className="text-accent-ink">review →</span>
    </Link>
  )
}

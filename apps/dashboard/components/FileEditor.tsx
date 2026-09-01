'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function FileEditor({ name, text, budget }: { name: string; text: string; budget: number }) {
  const router = useRouter()
  const [value, setValue] = useState(text)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const pct = Math.min(100, Math.round((value.length / budget) * 100))
  async function save() {
    setState('saving')
    const res = await fetch(`/api/kit/workspace/${name}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: value }),
    })
    setState(res.ok ? 'saved' : 'error')
    if (res.ok) router.refresh()
  }
  return (
    <div className="card flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="mono text-sm font-semibold">{name}</h3>
        <span className={`mono text-xs ${value.length > budget ? 'text-bad' : 'text-muted'}`}>
          {value.length} / {budget} ch
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded bg-surface-2">
        <div
          className={`h-full ${value.length > budget ? 'bg-bad' : 'bg-accent'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <textarea
        className="input mono min-h-48 text-xs"
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setState('idle')
        }}
        spellCheck={false}
      />
      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          {value.length > budget
            ? 'Over budget: the tail will be truncated in the prompt.'
            : "Applies on the agent's next turn."}
        </span>
        <button
          className="btn-primary"
          onClick={save}
          disabled={state === 'saving' || value === text}
        >
          {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : 'Save'}
        </button>
      </div>
      {state === 'error' ? <p className="text-xs text-bad">Save failed.</p> : null}
    </div>
  )
}

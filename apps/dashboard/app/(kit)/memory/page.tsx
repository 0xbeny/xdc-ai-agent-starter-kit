import { FileEditor } from '@/components/FileEditor.tsx'
import { kitSafe } from '@/lib/api.ts'

export const dynamic = 'force-dynamic'
const FILES = ['SOUL.md', 'IDENTITY.md', 'USER.md', 'AGENTS.md', 'MEMORY.md']

export default async function MemoryPage() {
  const files = await Promise.all(
    FILES.map((name) =>
      kitSafe<{ name: string; text: string; budget: number }>(`/workspace/${name}`, {
        name,
        text: '',
        budget: 0,
      }),
    ),
  )
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="eyebrow">Memory &amp; identity</p>
        <h1 className="text-2xl font-semibold tracking-tight">The agent is this folder</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          SOUL.md is injected first and verbatim. MEMORY.md is what the agent itself curates through
          its memory tool; edit it when it remembered something wrong.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {files.map(({ data }) => (
          <FileEditor
            key={data.name}
            name={data.name}
            text={data.text}
            budget={data.budget || 4000}
          />
        ))}
      </div>
    </div>
  )
}

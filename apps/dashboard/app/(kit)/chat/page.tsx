import { Chat } from '@/components/Chat.tsx'
import { PendingStrip } from '@/components/PendingStrip.tsx'

export default function ChatPage() {
  return (
    <div>
      <header className="mb-3">
        <p className="eyebrow">Chat</p>
      </header>
      <PendingStrip />
      <Chat />
    </div>
  )
}

'use client'

import { CopilotKit } from '@copilotkit/react-core'
import { CopilotChat } from '@copilotkit/react-ui'

export function Chat() {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit" agent="assistant" showDevConsole={false}>
      <div className="h-[calc(100vh-140px)] overflow-hidden rounded-md border border-line bg-surface">
        <CopilotChat
          className="h-full"
          labels={{
            title: 'Assistant',
            initial: 'What should I take care of?',
            placeholder: 'Delegate a task, ask a question, or say "what did you spend today?"',
          }}
        />
      </div>
    </CopilotKit>
  )
}

import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import { appendDailyLog, CuratedMemory } from './memory.ts'
import { listSkills, viewSkill } from './skills.ts'

// Return types are inferred: Mastra derives the Tool generics from the Zod schemas.
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createMemoryTool(workspaceDir: string, options: { max?: number } = {}) {
  const memory = new CuratedMemory(workspaceDir, options)
  return createTool({
    id: 'memory',
    description:
      'Edit your curated long-term memory (MEMORY.md): add a durable fact, replace a line that matches a substring, or remove one. ' +
      'Changes appear in your prompt from the next session. Keep facts short; the file is size-capped.',
    inputSchema: z.object({
      action: z.enum(['add', 'replace', 'remove']),
      text: z.string().optional().describe('New fact (add/replace)'),
      match: z
        .string()
        .optional()
        .describe('Substring identifying exactly one existing line (replace/remove)'),
    }),
    outputSchema: z.object({
      ok: z.boolean(),
      size: z.number(),
      max: z.number(),
      message: z.string(),
    }),
    execute: async ({ action, text, match }) => {
      try {
        const change =
          action === 'add'
            ? memory.add(text ?? '')
            : action === 'replace'
              ? memory.replace(match ?? '', text ?? '')
              : memory.remove(match ?? '')
        appendDailyLog(workspaceDir, `memory ${action}: ${(text ?? match ?? '').slice(0, 120)}`)
        return { ok: true, size: change.size, max: change.max, message: `${action} saved` }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { ok: false, size: memory.size(), max: memory.max, message }
      }
    },
  })
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createSkillTools(workspaceDir: string) {
  const skillsList = createTool({
    id: 'skills_list',
    description:
      'List available skills (name, description, category). Call skill_view to read one before using it.',
    inputSchema: z.object({}),
    outputSchema: z.object({
      skills: z.array(
        z.object({ name: z.string(), description: z.string(), category: z.string() }),
      ),
    }),
    execute: async () => ({
      skills: listSkills(workspaceDir).map(({ name, description, category }) => ({
        name,
        description,
        category,
      })),
    }),
  })

  const skillView = createTool({
    id: 'skill_view',
    description:
      "Read a skill's SKILL.md, or a file inside the skill directory (e.g. references/x.md).",
    inputSchema: z.object({ name: z.string(), path: z.string().optional() }),
    outputSchema: z.object({ content: z.string() }),
    execute: async ({ name, path }) => ({
      content: viewSkill(workspaceDir, name, path ?? 'SKILL.md'),
    }),
  })

  return { skills_list: skillsList, skill_view: skillView }
}

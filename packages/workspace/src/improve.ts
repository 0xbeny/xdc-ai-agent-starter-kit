import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { parseFrontmatter } from './frontmatter.ts'

/** Self-improvement writers: the only ways the agent may change its own workspace besides MEMORY.md. */
export class ImproveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImproveError'
  }
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/
export const MAX_SKILL_CHARS = 64_000
export const MAX_DOC_CHARS = 24_000
export const SOUL_DOCS = ['SOUL.md', 'USER.md', 'AGENTS.md'] as const
export type SoulDoc = (typeof SOUL_DOCS)[number]

export function validateSkill(category: string, name: string, content: string): void {
  if (!SLUG.test(category)) throw new ImproveError(`category must match ${SLUG} (got "${category}")`)
  if (!SLUG.test(name)) throw new ImproveError(`name must match ${SLUG} (got "${name}")`)
  if (!content.trim()) throw new ImproveError('content is empty')
  if (content.length > MAX_SKILL_CHARS)
    throw new ImproveError(`content is ${content.length} chars (max ${MAX_SKILL_CHARS})`)
  const { data } = parseFrontmatter(content)
  if (data.name !== name)
    throw new ImproveError(`frontmatter "name" must equal "${name}" (got "${data.name ?? ''}")`)
  if (!data.description?.trim())
    throw new ImproveError('frontmatter needs a one-line "description" so skills_list can show it')
}

export function writeSkill(
  workspaceDir: string,
  category: string,
  name: string,
  content: string,
): { path: string; action: 'created' | 'updated' } {
  validateSkill(category, name, content)
  const dir = join(resolve(workspaceDir), 'skills', category, name)
  const file = join(dir, 'SKILL.md')
  const action = existsSync(file) ? 'updated' : 'created'
  mkdirSync(dir, { recursive: true })
  writeFileSync(file, content.endsWith('\n') ? content : `${content}\n`)
  return { path: file, action }
}

export function writeSoulDoc(
  workspaceDir: string,
  file: string,
  content: string,
): { path: string; previousChars: number } {
  if (!(SOUL_DOCS as readonly string[]).includes(file))
    throw new ImproveError(`file must be one of ${SOUL_DOCS.join(', ')}`)
  if (!content.trim()) throw new ImproveError('content is empty — a soul file cannot be blanked')
  if (content.length > MAX_DOC_CHARS)
    throw new ImproveError(`content is ${content.length} chars (max ${MAX_DOC_CHARS})`)
  const path = join(resolve(workspaceDir), file)
  const previousChars = existsSync(path) ? readFileSync(path, 'utf8').length : 0
  writeFileSync(path, content.endsWith('\n') ? content : `${content}\n`)
  return { path, previousChars }
}

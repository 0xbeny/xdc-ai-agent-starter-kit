import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

import { parseFrontmatter } from './frontmatter.ts'

export interface SkillSummary {
  name: string
  description: string
  category: string
  dir: string
  version?: string
}

export class SkillError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SkillError'
  }
}

/** Walks skills/<category>/<name>/SKILL.md and returns frontmatter summaries (progressive disclosure step 1). */
export function listSkills(workspaceDir: string): SkillSummary[] {
  const root = join(resolve(workspaceDir), 'skills')
  if (!existsSync(root)) return []
  const out: SkillSummary[] = []
  for (const category of readdirSync(root)) {
    const catDir = join(root, category)
    if (!statSync(catDir).isDirectory()) continue
    for (const name of readdirSync(catDir)) {
      const dir = join(catDir, name)
      const file = join(dir, 'SKILL.md')
      if (!existsSync(file)) continue
      const { data } = parseFrontmatter(readFileSync(file, 'utf8'))
      const summary: SkillSummary = {
        name: data.name ?? name,
        description: data.description ?? '',
        category,
        dir,
      }
      if (data.version) summary.version = data.version
      out.push(summary)
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** Returns SKILL.md (or a file inside the skill directory) — step 2 of progressive disclosure. */
export function viewSkill(workspaceDir: string, name: string, path = 'SKILL.md'): string {
  const skill = listSkills(workspaceDir).find((s) => s.name === name)
  if (!skill) throw new SkillError(`Unknown skill "${name}"`)
  const target = resolve(skill.dir, path)
  const rel = relative(skill.dir, target)
  if (rel.startsWith('..') || rel.split(sep).includes('..') || resolve(target) !== target) {
    throw new SkillError('Path must stay inside the skill directory')
  }
  if (!existsSync(target) || !statSync(target).isFile()) {
    throw new SkillError(`"${path}" not found in skill "${name}"`)
  }
  return readFileSync(target, 'utf8')
}

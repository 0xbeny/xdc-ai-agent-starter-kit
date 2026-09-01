import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Creates the live workspace from the tracked templates when it is missing or empty.
 * Never overwrites: a user's SOUL.md is theirs, and `git pull` can't reach it because workspace/ is ignored.
 */
export function ensureWorkspace(workspaceDir: string, templatesDir: string): { seeded: boolean; files: string[] } {
  mkdirSync(workspaceDir, { recursive: true })
  const existing = readdirSync(workspaceDir).filter((f) => !f.startsWith('.'))
  if (existing.length > 0) return { seeded: false, files: existing }
  if (!existsSync(templatesDir)) return { seeded: false, files: [] }
  cpSync(templatesDir, workspaceDir, { recursive: true, force: false, errorOnExist: false })
  return { seeded: true, files: readdirSync(workspaceDir).filter((f) => !f.startsWith('.')) }
}

/**
 * Adds template entries missing from an existing workspace without touching edited ones.
 * Top-level files are added if absent; skills are synced per skill directory (skills/<category>/<name>),
 * so an update can deliver new bundled skills while a user's own skills and edits stay untouched.
 */
export function addMissingFromTemplates(workspaceDir: string, templatesDir: string): string[] {
  if (!existsSync(templatesDir)) return []
  const added: string[] = []
  for (const name of readdirSync(templatesDir)) {
    if (name === 'BOOTSTRAP.md') continue // first-run only; never re-add
    const source = join(templatesDir, name)
    const target = join(workspaceDir, name)
    if (name === 'skills' && statSync(source).isDirectory()) {
      added.push(...syncSkills(source, target))
      continue
    }
    if (existsSync(target)) continue
    cpSync(source, target, { recursive: true })
    added.push(name)
  }
  return added
}

function syncSkills(source: string, target: string): string[] {
  const added: string[] = []
  mkdirSync(target, { recursive: true })
  for (const entry of readdirSync(source)) {
    const s = join(source, entry)
    const t = join(target, entry)
    if (!statSync(s).isDirectory()) {
      if (!existsSync(t)) {
        cpSync(s, t)
        added.push(`skills/${entry}`)
      }
      continue
    }
    mkdirSync(t, { recursive: true })
    for (const skill of readdirSync(s)) {
      const ss = join(s, skill)
      const tt = join(t, skill)
      if (existsSync(tt)) continue
      cpSync(ss, tt, { recursive: true })
      added.push(`skills/${entry}/${skill}`)
    }
  }
  return added
}

import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { parseFrontmatter, writeSkill } from '@xdc-ai/workspace'

/**
 * Install a shared skill from any URL — GitHub folder/blob links are normalised to the raw
 * SKILL.md. The human ALWAYS reviews the full content before it lands: a skill is instructions
 * the agent will follow, so installing one from a stranger is the prompt-injection front door.
 */
export function rawSkillUrl(input: string): string {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new Error(`not a valid URL: ${input}`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('only http(s) URLs')
  if (url.hostname === 'github.com') {
    const m = /^\/([^/]+)\/([^/]+)\/(?:tree|blob)\/(.+)$/.exec(url.pathname)
    if (m) return rawSkillUrl(`https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`)
    throw new Error('github.com links must point at a folder or file (…/tree/… or …/blob/…)')
  }
  let out = url.toString().replace(/\/+$/, '')
  if (!out.endsWith('/SKILL.md')) out = `${out}/SKILL.md`
  return out
}

export interface InstallDeps {
  workspaceDir: string
  /** Shows the full skill text to the human and returns their decision. */
  confirm: (
    meta: { name: string; description: string; category: string },
    content: string,
  ) => Promise<boolean>
  fetchFn?: typeof fetch
}

export interface InstallResult {
  ok: boolean
  message: string
  name?: string
  category?: string
  path?: string
}

export async function installSkill(
  deps: InstallDeps,
  inputUrl: string,
  categoryOverride?: string,
): Promise<InstallResult> {
  let raw: string
  try {
    raw = rawSkillUrl(inputUrl)
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
  const fetchFn = deps.fetchFn ?? fetch
  let content: string
  try {
    const res = await fetchFn(raw, { redirect: 'follow', signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return { ok: false, message: `HTTP ${res.status} fetching ${raw}` }
    content = await res.text()
    if (content.length > 256 * 1024) return { ok: false, message: 'skill is larger than 256KB' }
  } catch (error) {
    return {
      ok: false,
      message: `fetch failed: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
  const { data } = parseFrontmatter(content)
  const name = data.name ?? ''
  const description = data.description ?? ''
  if (!name || !description)
    return { ok: false, message: 'not a skill: frontmatter must declare name and description' }
  const category = categoryOverride ?? 'community'
  const approved = await deps.confirm({ name, description, category }, content)
  if (!approved) return { ok: false, message: 'cancelled — nothing installed' }
  try {
    const r = writeSkill(deps.workspaceDir, category, name, content)
    writeFileSync(
      join(dirname(r.path), '.source.json'),
      `${JSON.stringify(
        {
          url: inputUrl,
          raw,
          sha256: createHash('sha256').update(content).digest('hex'),
          installedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
    )
    return {
      ok: true,
      message: `${r.action} ${category}/${name} — available via skills_list now`,
      name,
      category,
      path: r.path,
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

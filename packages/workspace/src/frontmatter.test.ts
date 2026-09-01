import { describe, expect, it } from 'vitest'

import { parseFrontmatter } from './frontmatter.ts'

describe('parseFrontmatter', () => {
  it('parses simple key/value pairs and returns the body', () => {
    const { data, body } = parseFrontmatter(
      '---\nname: deploy\ndescription: "Ship it"\n---\n# Deploy\nsteps',
    )
    expect(data).toEqual({ name: 'deploy', description: 'Ship it' })
    expect(body).toBe('# Deploy\nsteps')
  })

  it('returns the whole text as body when there is no frontmatter', () => {
    expect(parseFrontmatter('# Hello')).toEqual({ data: {}, body: '# Hello' })
  })

  it('keeps colons inside values', () => {
    expect(parseFrontmatter('---\nurl: https://x.y/z\n---\n').data.url).toBe('https://x.y/z')
  })
})

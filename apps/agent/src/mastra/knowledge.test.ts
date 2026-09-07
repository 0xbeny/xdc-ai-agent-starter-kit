import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { LibSQLVector } from '@mastra/libsql'
import { describe, expect, it } from 'vitest'

import { chunkText, KnowledgeStore } from './knowledge.ts'

describe('chunkText', () => {
  it('keeps paragraphs, splits long ones with overlap, drops empties', () => {
    expect(chunkText('')).toEqual([])
    expect(chunkText('one\n\ntwo')).toEqual(['one\n\ntwo'])
    const long = 'x'.repeat(2000)
    const chunks = chunkText(long, 900, 150)
    expect(chunks.length).toBeGreaterThan(2)
    expect(chunks[0]).toHaveLength(900)
  })
})

/** Deterministic 8-dim embedder: cheap, offline, and similar texts embed similarly. */
const fakeEmbedder = {
  specificationVersion: 'v2' as const,
  provider: 'fake',
  modelId: 'fake-embed',
  maxEmbeddingsPerCall: 100,
  supportsParallelCalls: true,
  doEmbed: async ({ values }: { values: string[] }) => ({
    embeddings: values.map((v) => {
      const vec = new Array<number>(8).fill(0)
      for (let i = 0; i < v.length; i++) vec[i % 8] = (vec[i % 8] ?? 0) + v.charCodeAt(i) / 1000
      const norm = Math.sqrt(vec.reduce((a, b) => a + b * b, 0)) || 1
      return vec.map((x) => x / norm)
    }),
  }),
}

describe('KnowledgeStore (real LibSQL vector file)', () => {
  it('adds, searches, lists and removes sources end-to-end', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'knowledge-'))
    const store = new KnowledgeStore({
      vector: new LibSQLVector({ url: `file:${join(dir, 'vec.db')}`, id: 'test-vec' }),
      embedder: fakeEmbedder,
      registryFile: join(dir, 'sources.json'),
    })
    expect(await store.search('anything')).toEqual([]) // empty index is not an error

    const r = await store.add(
      'The masternode rewards arrive hourly.\n\nGas is paid in XDC.',
      'xdc-notes',
    )
    expect(r.chunks).toBeGreaterThan(0)
    expect(store.sources().map((s) => s.source)).toEqual(['xdc-notes'])

    const hits = await store.search('masternode rewards')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]?.source).toBe('xdc-notes')
    expect(hits[0]?.text).toContain('masternode')

    const removed = await store.remove('xdc-notes')
    expect(removed.removed).toBe(r.chunks)
    expect(store.sources()).toEqual([])
    await expect(store.remove('xdc-notes')).rejects.toThrow(/no knowledge source/)
  })
})

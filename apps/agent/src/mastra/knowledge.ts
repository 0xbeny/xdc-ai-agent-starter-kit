import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { createTool } from '@mastra/core/tools'
import { ModelRouterEmbeddingModel } from '@mastra/core/llm'
import { LibSQLVector } from '@mastra/libsql'
import type { ModelSpec } from '@xdc-ai/models'
import { embed, embedMany } from 'ai'
import { z } from 'zod'

/**
 * Phase 3 v1: a plain vector knowledge base (LibSQL file by default, pgvector when DATABASE_URL
 * is set) + semantic recall over conversations. Entity-graph extraction is deliberately staged
 * for later — retrieval that works beats half a graph.
 */

/** Paragraph-aware splitter: keeps paragraphs together, splits long ones, overlaps for context. */
export function chunkText(text: string, size = 900, overlap = 150): string[] {
  const clean = text.replace(/\r\n/g, '\n').trim()
  if (!clean) return []
  const paras = clean.split(/\n{2,}/)
  const chunks: string[] = []
  let buf = ''
  const flush = (): void => {
    if (buf.trim()) chunks.push(buf.trim())
    buf = ''
  }
  for (const p of paras) {
    if (p.length > size) {
      flush()
      for (let i = 0; i < p.length; i += size - overlap) chunks.push(p.slice(i, i + size).trim())
      continue
    }
    if (buf.length + p.length + 2 > size) flush()
    buf = buf ? `${buf}\n\n${p}` : p
  }
  flush()
  return chunks.filter(Boolean)
}

interface VectorLike {
  createIndex(a: { indexName: string; dimension: number }): Promise<void>
  upsert(a: {
    indexName: string
    vectors: number[][]
    ids: string[]
    metadata: Record<string, unknown>[]
  }): Promise<unknown>
  query(a: {
    indexName: string
    queryVector: number[]
    topK: number
  }): Promise<{ id: string; score: number; metadata?: Record<string, unknown> }[]>
  deleteVector(a: { indexName: string; id: string }): Promise<void>
}

export interface KnowledgeHit {
  text: string
  source: string
  score: number
}

type Registry = Record<string, { chunks: number; addedAt: string }>

const sourceKey = (source: string): string =>
  createHash('sha1').update(source).digest('hex').slice(0, 12)

export class KnowledgeStore {
  private readonly vector: VectorLike
  private readonly embedder: unknown
  private readonly registryFile: string
  readonly indexName: string

  constructor(opts: {
    vector: unknown
    embedder: unknown
    registryFile: string
    indexName?: string
  }) {
    this.vector = opts.vector as VectorLike
    this.embedder = opts.embedder
    this.registryFile = opts.registryFile
    this.indexName = opts.indexName ?? 'kit_knowledge'
  }

  private registry(): Registry {
    if (!existsSync(this.registryFile)) return {}
    try {
      return JSON.parse(readFileSync(this.registryFile, 'utf8')) as Registry
    } catch {
      return {}
    }
  }

  private saveRegistry(r: Registry): void {
    mkdirSync(dirname(this.registryFile), { recursive: true })
    writeFileSync(this.registryFile, `${JSON.stringify(r, null, 2)}\n`)
  }

  sources(): { source: string; chunks: number; addedAt: string }[] {
    return Object.entries(this.registry())
      .map(([source, v]) => ({ source, ...v }))
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
  }

  async add(text: string, source: string): Promise<{ chunks: number }> {
    const chunks = chunkText(text)
    if (chunks.length === 0) throw new Error('nothing to add — the text is empty')
    const { embeddings } = await embedMany({ model: this.embedder as never, values: chunks })
    const dim = embeddings[0]?.length ?? 0
    try {
      await this.vector.createIndex({ indexName: this.indexName, dimension: dim })
    } catch {
      /* index already exists */
    }
    const key = sourceKey(source)
    const prev = this.registry()[source]?.chunks ?? 0
    await this.vector.upsert({
      indexName: this.indexName,
      vectors: embeddings as number[][],
      ids: chunks.map((_, i) => `${key}-${i}`),
      metadata: chunks.map((c) => ({ text: c, source })),
    })
    for (let i = chunks.length; i < prev; i++) {
      await this.vector
        .deleteVector({ indexName: this.indexName, id: `${key}-${i}` })
        .catch(() => undefined)
    }
    const reg = this.registry()
    reg[source] = { chunks: chunks.length, addedAt: new Date().toISOString() }
    this.saveRegistry(reg)
    return { chunks: chunks.length }
  }

  async search(query: string, topK = 6): Promise<KnowledgeHit[]> {
    try {
      const { embedding } = await embed({ model: this.embedder as never, value: query })
      const hits = await this.vector.query({
        indexName: this.indexName,
        queryVector: embedding as number[],
        topK,
      })
      return hits.map((h) => ({
        text: String(h.metadata?.text ?? ''),
        source: String(h.metadata?.source ?? 'unknown'),
        score: h.score,
      }))
    } catch {
      return [] // empty index / knowledge never used yet
    }
  }

  async remove(source: string): Promise<{ removed: number }> {
    const reg = this.registry()
    const entry = reg[source]
    if (!entry)
      throw new Error(`no knowledge source named "${source}" (knowledge_sources lists them)`)
    const key = sourceKey(source)
    for (let i = 0; i < entry.chunks; i++) {
      await this.vector
        .deleteVector({ indexName: this.indexName, id: `${key}-${i}` })
        .catch(() => undefined)
    }
    const { [source]: _gone, ...rest } = reg
    this.saveRegistry(rest)
    return { removed: entry.chunks }
  }
}

export function createEmbedder(spec: ModelSpec | undefined): unknown {
  if (!spec) return undefined
  try {
    return new ModelRouterEmbeddingModel(`${spec.provider}/${spec.model}`)
  } catch (error) {
    console.warn(
      `[agent] MODEL_EMBED ${spec.provider}/${spec.model} not usable: ${error instanceof Error ? error.message : String(error)} — knowledge base disabled`,
    )
    return undefined
  }
}

export function createKnowledgeVector(
  env: Readonly<Record<string, string | undefined>>,
  dataDir: string,
): unknown {
  const url = env.DATABASE_URL?.trim()
  if (url) {
    // Loaded lazily so SQLite installs never touch pg. Structurally compatible with VectorLike.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- see above
    const { PgVector } = require('@mastra/pg') as {
      PgVector: new (c: { connectionString: string; id: string }) => unknown
    }
    return new PgVector({ connectionString: url, id: 'kit-vector' })
  }
  mkdirSync(dataDir, { recursive: true })
  return new LibSQLVector({ url: `file:${join(dataDir, 'vector.db')}`, id: 'kit-vector' })
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- Mastra infers the Tool generics
export function createKnowledgeTools(store: KnowledgeStore) {
  return {
    knowledge_add: createTool({
      id: 'knowledge_add',
      description:
        'Store text in your searchable knowledge base (chunked + embedded). Use for documents, notes, downloaded files (read them with run_command first), or anything the human wants findable later. Give a stable, human-readable source name — re-adding the same source replaces it.',
      inputSchema: z.object({
        text: z.string().max(200_000),
        source: z
          .string()
          .describe('Stable name, e.g. "onboarding-guide.pdf" or "meeting 2026-09-07"'),
      }),
      execute: async ({ text, source }) => {
        try {
          const r = await store.add(text, source)
          return { ok: true, message: `stored "${source}" as ${r.chunks} chunk(s)` }
        } catch (error) {
          return { ok: false, message: error instanceof Error ? error.message : String(error) }
        }
      },
    }),
    knowledge_search: createTool({
      id: 'knowledge_search',
      description:
        'Semantic search over the knowledge base. Use BEFORE answering anything that might be covered by stored documents or notes.',
      inputSchema: z.object({
        query: z.string(),
        topK: z.number().int().min(1).max(20).optional(),
      }),
      execute: async ({ query, topK }) => ({ hits: await store.search(query, topK ?? 6) }),
    }),
    knowledge_sources: createTool({
      id: 'knowledge_sources',
      description: 'List what is in the knowledge base (source names, chunk counts).',
      inputSchema: z.object({}),
      execute: async () => ({ sources: store.sources() }),
    }),
    knowledge_remove: createTool({
      id: 'knowledge_remove',
      description: 'Remove one source (and all its chunks) from the knowledge base.',
      inputSchema: z.object({ source: z.string() }),
      execute: async ({ source }) => {
        try {
          const r = await store.remove(source)
          return { ok: true, message: `removed "${source}" (${r.removed} chunks)` }
        } catch (error) {
          return { ok: false, message: error instanceof Error ? error.message : String(error) }
        }
      },
    }),
  }
}

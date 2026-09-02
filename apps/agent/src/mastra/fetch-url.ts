import { createWriteStream, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

/**
 * Download-only internet access: a GET into the sandbox working dir. Available even when sandbox
 * networking is blocked — the fetch happens in the agent process, the bytes land where run_command
 * can reach them. No request bodies, no custom headers, no private/loopback targets.
 */
export const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024

const PRIVATE_HOST =
  /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)|\.local$/i

export function blockedUrl(raw: string, allowPrivate = false): string | undefined {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return 'not a valid URL'
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'only http(s) URLs'
  if (!allowPrivate && PRIVATE_HOST.test(url.hostname))
    return 'private/loopback addresses are not fetchable'
  return undefined
}

export function safeFilename(name: string | undefined, url: string): string {
  const fallback = new URL(url).pathname.split('/').filter(Boolean).pop() ?? 'download.bin'
  const raw = (name?.trim() || fallback).replace(/[^A-Za-z0-9._-]/g, '_').replace(/^[._]+/, '')
  return raw || 'download.bin'
}

export interface FetchResult {
  ok: boolean
  message: string
  path?: string
  bytes?: number
  contentType?: string
  status?: number
}

export async function fetchUrlToDir(
  dir: string,
  input: { url: string; filename?: string | undefined },
  allowPrivate = false,
): Promise<FetchResult> {
  const blocked = blockedUrl(input.url, allowPrivate)
  if (blocked) return { ok: false, message: blocked }
  mkdirSync(dir, { recursive: true })
  const path = join(dir, safeFilename(input.filename, input.url))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 120_000)
  try {
    const res = await fetch(input.url, { redirect: 'follow', signal: controller.signal })
    const contentType = res.headers.get('content-type') ?? 'unknown'
    if (!res.ok || !res.body)
      return { ok: false, message: `HTTP ${res.status}`, status: res.status, contentType }
    let bytes = 0
    const counted = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctl) {
        bytes += chunk.byteLength
        if (bytes > MAX_DOWNLOAD_BYTES)
          ctl.error(new Error(`larger than ${MAX_DOWNLOAD_BYTES} bytes`))
        else ctl.enqueue(chunk)
      },
    })
    await pipeline(
      Readable.fromWeb(res.body.pipeThrough(counted) as never),
      createWriteStream(path),
    )
    return {
      ok: true,
      message: `saved ${bytes} bytes to ${path} (${contentType}) — process it with run_command`,
      path,
      bytes,
      contentType,
      status: res.status,
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timer)
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- Mastra infers the Tool generics
export function createFetchTools(dir: string) {
  return {
    fetch_url: createTool({
      id: 'fetch_url',
      description:
        `Download a URL (GET only, max ${MAX_DOWNLOAD_BYTES / 1024 / 1024}MB) into your sandbox working dir, then process the file with run_command. ` +
        'Works even when sandbox networking is blocked. Private/loopback addresses are refused.',
      inputSchema: z.object({
        url: z.string().describe('http(s) URL'),
        filename: z.string().optional().describe('Optional name for the saved file'),
      }),
      execute: async (input) => fetchUrlToDir(dir, input),
    }),
  }
}

'use client'

/**
 * cachedFetch — SWR-lite module-level JSON cache for client components.
 *
 * Returns cached JSON immediately when it's fresher than `staleMs`, while
 * revalidating in the background so the next visit gets updated data. No
 * dependencies, no context — just a module-level Map, so the cache survives
 * client-side navigations but not full page reloads.
 *
 * Use for frequently-revisited, read-mostly GET endpoints (notification
 * lists, leave lists, time views). After a mutation, call
 * `invalidateCache(url)` (or refetch with { force: true }) so the next read
 * isn't stale.
 */

interface CacheEntry {
  data: unknown
  ts: number
  inflight: Promise<unknown> | null
}

const cache = new Map<string, CacheEntry>()

export interface CachedFetchOpts {
  /** How long a cached response is served without waiting (default 60s). */
  staleMs?: number
  /** Skip the cache and hit the network (still updates the cache). */
  force?: boolean
  /** Optional AbortSignal for the network request. */
  signal?: AbortSignal
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Request failed (${res.status})`)
  return res.json() as Promise<T>
}

export async function cachedFetch<T = unknown>(
  url: string,
  opts: CachedFetchOpts = {},
): Promise<T> {
  const { staleMs = 60_000, force = false, signal } = opts
  const entry = cache.get(url)

  if (!force && entry && Date.now() - entry.ts < staleMs) {
    // Fresh enough: serve immediately, revalidate in the background.
    if (!entry.inflight) {
      entry.inflight = fetchJson<T>(url)
        .then((data) => {
          cache.set(url, { data, ts: Date.now(), inflight: null })
          return data
        })
        .catch(() => {
          // Background refresh failed — keep serving the cached copy.
          if (entry.inflight) entry.inflight = null
          return entry.data
        })
    }
    return entry.data as T
  }

  // Cache miss / stale / forced: fetch and populate.
  const data = await fetchJson<T>(url, signal)
  cache.set(url, { data, ts: Date.now(), inflight: null })
  return data
}

/** Drop a cached URL (exact match) or every URL starting with a prefix. */
export function invalidateCache(urlOrPrefix: string, prefix = false): void {
  if (!prefix) {
    cache.delete(urlOrPrefix)
    return
  }
  for (const key of cache.keys()) {
    if (key.startsWith(urlOrPrefix)) cache.delete(key)
  }
}

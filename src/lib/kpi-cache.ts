/**
 * Tiny in-memory memo for expensive dashboard KPI computations.
 *
 * This is a SMOOTHING cache, not a correctness cache: it lives per lambda /
 * per server process and simply stops the dashboard from re-running 20+
 * aggregate queries on every visit within a short window. Data can be up to
 * `ttlMs` stale — acceptable for aggregate KPIs (headcount, pending counts),
 * NOT for personal, mutation-sensitive state (e.g. clock-in status), so only
 * wrap role-level aggregate loaders with it.
 */

interface Entry {
  data: unknown
  ts: number
}

const store = new Map<string, Entry>()

export async function memoKpi<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = store.get(key)
  if (hit && Date.now() - hit.ts < ttlMs) {
    return hit.data as T
  }
  const data = await fn()
  store.set(key, { data, ts: Date.now() })
  return data
}

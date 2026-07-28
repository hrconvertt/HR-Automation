/**
 * safeFetch — defensive client-side fetch wrapper.
 *
 * Why this exists:
 *   - Plain `await fetch(...)` + `await res.json()` blows up if the server
 *     returns HTML (e.g. session expired → middleware redirect serves the
 *     login page as HTML), because `res.json()` throws.
 *   - Most call sites in this app didn't check `res.ok`, so 401/403/500
 *     responses fell through silently and produced empty UIs.
 *
 * This helper:
 *   - Always returns a normalized `{ ok, status, data, error }` shape.
 *   - Detects HTML responses and treats them as session-expired.
 *   - Parses JSON safely (never throws).
 *   - Optionally surfaces server-side `error` strings.
 *
 * Usage:
 *   const r = await safeFetch<{ logs: TodayRecord[] }>('/api/attendance?today=true')
 *   if (!r.ok) { setError(r.error); return }
 *   setLogs(r.data?.logs ?? [])
 */

export interface SafeFetchResult<T> {
  ok: boolean
  status: number
  data: T | null
  error: string | null
  /** True when the response looked like a login redirect or 401 */
  sessionExpired: boolean
}

export async function safeFetch<T = unknown>(
  url: string,
  init?: RequestInit,
): Promise<SafeFetchResult<T>> {
  let res: Response
  try {
    res = await fetch(url, { cache: 'no-store', ...init })
  } catch (e) {
    return {
      ok: false, status: 0, data: null,
      error: e instanceof Error ? e.message : 'Network error',
      sessionExpired: false,
    }
  }

  const contentType = res.headers.get('content-type') ?? ''
  const looksLikeHtml = contentType.includes('text/html')
  const sessionExpired = res.status === 401 || (looksLikeHtml && res.status >= 200 && res.status < 400)

  if (looksLikeHtml) {
    // Don't try to parse — it's a login page or some other HTML response
    return {
      ok: false,
      status: res.status,
      data: null,
      error: sessionExpired ? 'Your session expired. Please sign in again.' : 'Unexpected response.',
      sessionExpired,
    }
  }

  let data: T | null = null
  let parseError: string | null = null
  try {
    data = await res.json()
  } catch {
    parseError = 'Server returned an invalid response.'
  }

  if (!res.ok) {
    const serverError = (data && typeof data === 'object' && 'error' in (data as Record<string, unknown>))
      ? String((data as Record<string, unknown>).error)
      : null
    return {
      ok: false,
      status: res.status,
      data,
      error: serverError ?? parseError ?? `Request failed (${res.status}).`,
      sessionExpired: res.status === 401,
    }
  }

  return {
    ok: true,
    status: res.status,
    data,
    error: parseError, // success status but parse problem — surface for the rare malformed-success case
    sessionExpired: false,
  }
}

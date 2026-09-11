/** A stored day (local midnight on the server) as "14 Sep 2026". */
export function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Today plus n days as YYYY-MM-DD, for a date input's default. */
export function isoDayFromNow(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const inputCls =
  'w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900'

export async function readError(res: Response): Promise<string> {
  const d = await res.json().catch(() => ({}))
  return (d as { error?: string }).error ?? 'Something went wrong.'
}

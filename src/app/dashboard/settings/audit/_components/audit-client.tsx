'use client'

/**
 * The audit trail.
 *
 * Attendance edits outnumber everything else roughly fifty to one, so an
 * unfiltered list is a wall of them and the salary changes — the rows anyone
 * opens this screen for — are buried. The entity chips carry their counts and
 * the money-and-identity ones are marked, so the useful subset is one click
 * away rather than a scroll away.
 */

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Search, ChevronRight, ShieldAlert, ArrowRight } from 'lucide-react'
import {
  type AuditRow, entityLabel, actionTone, describeChange, CONSEQUENTIAL,
} from '@/lib/audit-trail'

interface Facet { value: string; count: number }
interface Payload {
  rows: AuditRow[]
  total: number
  page: number
  pages: number
  facets: { entity: Facet[]; action: Facet[] }
}

const SINCE = [
  { value: '', label: 'All time' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
]

export function AuditClient() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [entity, setEntity] = useState('')
  const [action, setAction] = useState('')
  const [since, setSince] = useState('')
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [page, setPage] = useState(1)
  const [openRow, setOpenRow] = useState<string | null>(null)

  // Typing should not fire a query per keystroke against 1,500 rows.
  useEffect(() => {
    const t = setTimeout(() => { setTerm(q); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [q])

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const sp = new URLSearchParams()
    if (entity) sp.set('entity', entity)
    if (action) sp.set('action', action)
    if (since) sp.set('since', since)
    if (term) sp.set('q', term)
    sp.set('page', String(page))
    try {
      const res = await fetch('/api/audit?' + sp.toString())
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Could not load the audit trail.'); return }
      setData(d)
    } catch {
      setError('Could not reach the server.')
    } finally { setLoading(false) }
  }, [entity, action, since, term, page])

  useEffect(() => { load() }, [load])

  const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })

  const everything = data?.facets.entity.reduce((n, f) => n + f.count, 0)

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chip
            active={!entity}
            onClick={() => { setEntity(''); setPage(1) }}
            label="Everything"
            count={everything}
          />
          {data?.facets.entity.map((f) => (
            <Chip
              key={f.value}
              active={entity === f.value}
              onClick={() => { setEntity(f.value === entity ? '' : f.value); setPage(1) }}
              label={entityLabel(f.value)}
              count={f.count}
              flagged={CONSEQUENTIAL.has(f.value)}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Whose record was changed — name or code"
              className="w-full text-sm rounded-lg border border-slate-200 pl-9 pr-3 py-1.5"
            />
          </span>
          <select
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1) }}
            className="text-[13px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"
          >
            <option value="">Any action</option>
            {data?.facets.action.map((f) => (
              <option key={f.value} value={f.value}>
                {f.value.charAt(0) + f.value.slice(1).toLowerCase()} ({f.count})
              </option>
            ))}
          </select>
          <select
            value={since}
            onChange={(e) => { setSince(e.target.value); setPage(1) }}
            className="text-[13px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"
          >
            {SINCE.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {error && (
        <p className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">{error}</p>
      )}

      {loading && !data ? (
        <p className="text-sm text-slate-400 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </p>
      ) : !data || data.rows.length === 0 ? (
        <p className="bg-white border border-slate-200 rounded-xl px-4 py-10 text-center text-sm text-slate-400">
          Nothing recorded for that.
        </p>
      ) : (
        <>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-sm font-semibold text-slate-900">
                {data.total.toLocaleString()} {data.total === 1 ? 'record' : 'records'}
              </h2>
              <span className="text-[11px] text-slate-400">Newest first · click a row for the detail</span>
            </div>
            <ul className="divide-y divide-slate-50">
              {data.rows.map((r) => {
                const changes = describeChange(r.oldValue, r.newValue, r.action)
                const open = openRow === r.id
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setOpenRow(open ? null : r.id)}
                      className="w-full text-left px-4 py-2.5 hover:bg-slate-50/70 flex items-start gap-3"
                    >
                      <ChevronRight
                        className={'w-3.5 h-3.5 text-slate-300 mt-1 flex-shrink-0 transition-transform '
                          + (open ? 'rotate-90' : '')}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className={'text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ' + actionTone(r.action)}>
                            {r.action}
                          </span>
                          <span className="text-[13px] font-medium text-slate-900">
                            {entityLabel(r.entity)}
                          </span>
                          {CONSEQUENTIAL.has(r.entity) && (
                            <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                          )}
                          {r.subject && (
                            <span className="text-[13px] text-slate-600">
                              · {r.subject.fullName}
                              <span className="text-slate-400"> ({r.subject.employeeCode})</span>
                            </span>
                          )}
                        </span>
                        <span className="block text-[11px] text-slate-400 mt-0.5">
                          {fmt(r.createdAt)}
                          {r.actor ? ' · by ' + r.actor.name : ' · actor not recorded'}
                          {changes.length
                            ? ' · ' + changes.length + (changes.length === 1 ? ' field' : ' fields')
                            : ''}
                        </span>
                      </span>
                    </button>

                    {open && (
                      <div className="px-4 pb-3 pl-11">
                        {changes.length === 0 ? (
                          <p className="text-[12px] text-slate-400">
                            No field detail was recorded with this entry.
                          </p>
                        ) : (
                          <div className="rounded-lg border border-slate-100 overflow-hidden">
                            {changes.map((c) => (
                              <div
                                key={c.field}
                                className="flex items-start gap-3 px-3 py-2 border-b border-slate-50 last:border-b-0 text-[12px]"
                              >
                                <span className="w-40 flex-shrink-0 text-slate-500">{c.field}</span>
                                {c.removed ? (
                                  <span className="text-slate-500 break-words">
                                    held <span className="text-slate-800">{c.before}</span>
                                  </span>
                                ) : c.before !== null ? (
                                  <>
                                    <span className="text-slate-500 line-through break-words">{c.before}</span>
                                    <ArrowRight className="w-3 h-3 text-slate-300 flex-shrink-0 mt-0.5" />
                                    <span className="text-slate-900 font-medium break-words">{c.after ?? '—'}</span>
                                  </>
                                ) : (
                                  <span className="text-slate-900 break-words">
                                    set to <span className="font-medium">{c.after ?? '—'}</span>
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        <p className="text-[11px] text-slate-400 mt-2">
                          {r.entityId ? 'Record ' + r.entityId : 'No record id'}
                          {r.ipAddress ? ' · from ' + r.ipAddress : ''}
                        </p>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>

          {data.pages > 1 && (
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={data.page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="text-[13px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-[12px] text-slate-500">
                Page {data.page} of {data.pages}
              </span>
              <button
                type="button"
                disabled={data.page >= data.pages || loading}
                onClick={() => setPage((p) => p + 1)}
                className="text-[13px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Chip({ label, count, active, flagged, onClick }: {
  label: string; count?: number; active: boolean; flagged?: boolean; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={'inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-lg border '
        + (active
          ? 'bg-slate-900 text-white border-slate-900'
          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50')}
    >
      {flagged && <ShieldAlert className={'w-3 h-3 ' + (active ? 'text-amber-300' : 'text-amber-500')} />}
      {label}
      {count != null && (
        <span className={active ? 'text-slate-300' : 'text-slate-400'}>{count.toLocaleString()}</span>
      )}
    </button>
  )
}

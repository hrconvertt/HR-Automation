'use client'

/**
 * Manage Learning Content — shaped after Workday's catalogue admin.
 *
 * Every course with its cover, a two-line description, its rating, how many
 * people are on it and how many finished, and whether it has any lessons yet.
 * Filters down the left narrow the list; the search box matches title,
 * description and provider. Each row goes to the course, where HR builds the
 * content and presses Assign.
 *
 * Workday's facets for assessors, access type, certification and competency
 * are not here — there is nothing in the catalogue for them to filter on.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, Star, X, Pencil } from 'lucide-react'
import { CourseCover } from './course-cover'
import { PROGRAM_TYPES, PROGRAM_TYPE_LABELS, type ProgramType } from '@/lib/learning'
import type { ContentRow } from '@/lib/queries/learning-admin'

type ContentState = 'ALL' | 'HAS' | 'NONE'
const typeLabel = (t: string) => PROGRAM_TYPE_LABELS[t as ProgramType] ?? t

function lengthLabel(h: number | null): string {
  if (h == null || h <= 0) return 'Self-paced'
  if (h < 1) return `${Math.round(h * 60)} minutes`
  const r = Math.round(h * 10) / 10
  return `${r} hour${r === 1 ? '' : 's'}`
}

export function ContentManager({ rows }: { rows: ContentRow[] }) {
  const [q, setQ] = useState('')
  const [types, setTypes] = useState<string[]>([])
  const [state, setState] = useState<ContentState>('ALL')
  const [providers, setProviders] = useState<string[]>([])

  const providerList = useMemo(
    () => [...new Set(rows.map((r) => r.provider).filter((p): p is string => !!p))].sort(),
    [rows],
  )

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (types.length && !types.includes(r.type)) return false
      const has = r.lessons > 0 || r.hasQuiz
      if (state === 'HAS' && !has) return false
      if (state === 'NONE' && has) return false
      if (providers.length && !(r.provider && providers.includes(r.provider))) return false
      if (!needle) return true
      return [r.title, r.description, r.provider].filter(Boolean).join(' ').toLowerCase().includes(needle)
    })
  }, [rows, q, types, state, providers])

  const dirty = q !== '' || types.length > 0 || state !== 'ALL' || providers.length > 0
  const clear = () => { setQ(''); setTypes([]); setState('ALL'); setProviders([]) }
  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  const withContent = rows.filter((r) => r.lessons > 0 || r.hasQuiz).length

  return (
    <div className="space-y-5 min-w-0">
      <div
        className="rounded-2xl text-white px-6 py-6"
        style={{ background: 'linear-gradient(115deg, #0f172a 0%, #1e3a8a 100%)' }}
      >
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Manage Learning Content</h1>
        <p className="text-sm text-slate-300 mt-1">
          {rows.length} courses · {withContent} with lessons or a quiz
        </p>
      </div>

      <label className="relative block">
        <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search the catalogue"
          aria-label="Search the catalogue"
          className="w-full text-sm pl-11 pr-4 py-3 rounded-full border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
        />
      </label>

      <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)] items-start">
        {/* Facets */}
        <aside className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Current search</p>
            {dirty && (
              <button type="button" onClick={clear} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900">
                <X className="w-3 h-3" /> Clear all
              </button>
            )}
          </div>

          <Facet label="Content type">
            {PROGRAM_TYPES.filter((t) => rows.some((r) => r.type === t)).map((t) => (
              <Check
                key={t}
                label={typeLabel(t)}
                n={rows.filter((r) => r.type === t).length}
                on={types.includes(t)}
                onChange={() => toggle(types, setTypes, t)}
              />
            ))}
          </Facet>

          <Facet label="Content status">
            {([['ALL', 'Any'], ['HAS', 'Has lessons or a quiz'], ['NONE', 'Nothing added yet']] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                <input type="radio" name="content-state" checked={state === key} onChange={() => setState(key)} className="border-slate-300" />
                {label}
              </label>
            ))}
          </Facet>

          {providerList.length > 0 && (
            <Facet label="Content provider">
              {providerList.map((p) => (
                <Check
                  key={p}
                  label={p}
                  n={rows.filter((r) => r.provider === p).length}
                  on={providers.includes(p)}
                  onChange={() => toggle(providers, setProviders, p)}
                />
              ))}
            </Facet>
          )}
        </aside>

        {/* Results */}
        <div className="min-w-0">
          <p className="text-xs text-slate-500 mb-2">{shown.length} of {rows.length}</p>
          {shown.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-white text-sm text-slate-400 py-12 text-center">
              No course matches that.
            </p>
          ) : (
            <ul className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
              {shown.map((r) => {
                const href = `/dashboard/learning/programs/${r.id}`
                const has = r.lessons > 0 || r.hasQuiz
                return (
                  <li key={r.id} className="flex gap-4 p-4 hover:bg-slate-50/60 transition-colors">
                    <Link href={href} tabIndex={-1} className="hidden sm:block w-40 h-24 flex-shrink-0 rounded-lg overflow-hidden">
                      <CourseCover id={`cm-${r.id}`} title={r.title} type={r.type} className="w-full h-full" />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link href={href} className="font-semibold text-slate-900 hover:underline">{r.title}</Link>
                      <p className="text-xs text-slate-600 mt-1 line-clamp-2">{r.description ?? 'No description yet.'}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-slate-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        <span className="inline-flex items-center gap-0.5" title={r.ratingAvg != null ? `${r.ratingAvg.toFixed(1)} from ${r.ratings}` : 'Not rated yet'}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star key={n} className={`w-3 h-3 ${r.ratingAvg != null && n <= Math.round(r.ratingAvg) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                          ))}
                          <span className="ml-1">({r.ratings})</span>
                        </span>
                        <span>{typeLabel(r.type)}</span>
                        <span>{lengthLabel(r.duration)}</span>
                        <span>{r.enrolled} enrolled · {r.completed} completed</span>
                        <span className={has ? 'text-slate-500' : 'text-amber-700'}>
                          {has
                            ? `${r.lessons} lesson${r.lessons === 1 ? '' : 's'}${r.hasQuiz ? ' + quiz' : ''}`
                            : 'No lessons yet'}
                        </span>
                        {r.provider && <span>{r.provider}</span>}
                      </div>
                    </div>
                    <Link
                      href={href}
                      className="self-center inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border border-slate-300 text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                    >
                      <Pencil className="w-3 h-3" /> {has ? 'Open' : 'Build content'}
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function Facet({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details open className="group">
      <summary className="px-4 py-2.5 text-xs font-medium text-slate-700 cursor-pointer list-none flex items-center justify-between">
        {label}
        <span className="text-slate-400 text-[10px] group-open:rotate-180 transition-transform">▾</span>
      </summary>
      <div className="px-4 pb-3 space-y-1.5">{children}</div>
    </details>
  )
}

function Check({ label, n, on, onChange }: { label: string; n: number; on: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
      <input type="checkbox" checked={on} onChange={onChange} className="rounded border-slate-300" />
      <span className="flex-1">{label}</span>
      <span className="text-slate-400" style={{ fontVariantNumeric: 'tabular-nums' }}>{n}</span>
    </label>
  )
}

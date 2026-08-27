'use client'

/**
 * Every employee's onboarding documents, in one table.
 *
 * The sheet this replaces is read by scanning down a column for the gaps, so
 * the table keeps that shape: one row per person, one column per document,
 * grouped headers over the pairs that have two signatures. Clicking a cell
 * toggles it; Save writes every change at once.
 *
 * Cells that do not apply — an internship letter for a permanent hire — are
 * struck through rather than left blank, so an empty cell always means missing.
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Check, Loader2, Search, Save, AlertTriangle, Download } from 'lucide-react'
import {
  CHECKLIST_COLUMNS, GROUP_LABELS, applies, rowProgress,
  type ChecklistColumn,
} from '@/lib/onboarding-checklist'

export interface GridRow {
  employeeId: string
  employeeCode: string
  fullName: string
  joiningDate: string | null
  employeeType: string | null
  department: string | null
  status: string
  checklist: Record<string, boolean> | null
  /** Ticked columns with no matching document uploaded — flagged, not counted
   *  as missing: the tick may well be right, it just has nothing behind it. */
  unevidenced?: string[]
}

const day = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
      })
    : '—'

/** The grouped header — one cell spanning each document's columns. */
function groupSpans(): Array<{ group: ChecklistColumn['group']; span: number }> {
  const out: Array<{ group: ChecklistColumn['group']; span: number }> = []
  for (const c of CHECKLIST_COLUMNS) {
    const last = out[out.length - 1]
    if (last && last.group === c.group) last.span += 1
    else out.push({ group: c.group, span: 1 })
  }
  return out
}

export function ChecklistGrid({ rows, isHR }: { rows: GridRow[]; isHR: boolean }) {
  const router = useRouter()
  const [edits, setEdits] = useState<Record<string, boolean>>({})
  const [q, setQ] = useState('')
  const [only, setOnly] = useState<'all' | 'incomplete'>('all')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  const cellKey = (employeeId: string, key: string) => `${employeeId}::${key}`

  /** Current value: a pending edit if there is one, else what is stored. */
  const valueOf = (r: GridRow, key: string): boolean => {
    const k = cellKey(r.employeeId, key)
    if (k in edits) return edits[k]
    return r.checklist?.[key] === true
  }

  /** The row as it stands including pending edits, for the progress figure. */
  const merged = (r: GridRow): Record<string, boolean> => {
    const out: Record<string, boolean> = { ...(r.checklist ?? {}) }
    for (const c of CHECKLIST_COLUMNS) out[c.key] = valueOf(r, c.key)
    return out
  }

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (needle
        && !r.fullName.toLowerCase().includes(needle)
        && !r.employeeCode.toLowerCase().includes(needle)
        && !(r.department ?? '').toLowerCase().includes(needle)) return false
      if (only === 'incomplete' && rowProgress(merged(r), r.employeeType).pct === 100) return false
      return true
    })
    // merged() reads `edits`, so the filter has to recompute when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, only, edits])

  const dirty = Object.keys(edits).length

  function toggle(r: GridRow, col: ChecklistColumn) {
    if (!isHR || !applies(col, r.employeeType)) return
    const k = cellKey(r.employeeId, col.key)
    const next = !valueOf(r, col.key)
    setEdits((prev) => {
      const copy = { ...prev }
      // Toggling back to the stored value is not a change.
      if ((r.checklist?.[col.key] === true) === next) delete copy[k]
      else copy[k] = next
      return copy
    })
    setSavedAt(null)
  }

  /** Tick every applicable, still-missing cell on one person. */
  function completeRow(r: GridRow) {
    if (!isHR) return
    setEdits((prev) => {
      const copy = { ...prev }
      for (const c of CHECKLIST_COLUMNS) {
        if (!applies(c, r.employeeType)) continue
        if (valueOf(r, c.key)) continue
        copy[cellKey(r.employeeId, c.key)] = true
      }
      return copy
    })
    setSavedAt(null)
  }

  async function save() {
    setSaving(true); setErr(null)
    const changes = Object.entries(edits).map(([k, value]) => {
      const [employeeId, key] = k.split('::')
      return { employeeId, key, value }
    })
    const res = await fetch('/api/onboarding/checklist-grid', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes }),
    })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setErr(d.error ?? 'Could not save.')
      return
    }
    setEdits({})
    setSavedAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))
    router.refresh()
  }

  /** CSV of exactly what is on screen, so the sheet can still be handed over. */
  function exportCsv() {
    const header = ['Employee Code', 'Full Name', 'Joining Date', 'Department', 'Type',
      ...CHECKLIST_COLUMNS.map((c) => c.label), 'Complete']
    const lines = [header]
    for (const r of view) {
      const m = merged(r)
      lines.push([
        r.employeeCode, r.fullName, day(r.joiningDate),
        r.department ?? '', r.employeeType ?? '',
        ...CHECKLIST_COLUMNS.map((c) =>
          !applies(c, r.employeeType) ? 'None' : m[c.key] ? 'Yes' : 'No'),
        `${rowProgress(m, r.employeeType).pct}%`,
      ])
    }
    const csv = lines
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `onboarding-checklist-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Which columns have gaps, across everyone on screen — the "what are we
  // chasing this week" number.
  const gaps = CHECKLIST_COLUMNS.map((c) => ({
    col: c,
    missing: view.filter((r) => applies(c, r.employeeType) && !valueOf(r, c.key)).length,
  })).filter((g) => g.missing > 0).sort((a, b) => b.missing - a.missing)

  const fullyDone = view.filter((r) => rowProgress(merged(r), r.employeeType).pct === 100).length
  const flaggedCount = view.reduce((n, r) => n + (r.unevidenced?.length ?? 0), 0)

  return (
    <div className="space-y-3">
      {err && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{err}</p>}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs text-slate-500">
              <span className="font-semibold text-slate-900">{view.length}</span> employees ·{' '}
              {fullyDone} complete · {view.length - fullyDone} with gaps
            </p>
            {gaps.length > 0 && (
              <p className="text-[11px] text-slate-400 mt-0.5">
                Most missing: {gaps.slice(0, 3).map((g) => `${g.col.label} (${g.missing})`).join(' · ')}
              </p>
            )}
            {flaggedCount > 0 && (
              <p className="text-[11px] text-amber-700 mt-0.5 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {flaggedCount} tick{flaggedCount === 1 ? '' : 's'} with no document on file
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name, code or department"
                className="pl-8 pr-3 py-1.5 rounded-md border border-slate-300 text-sm w-56"
              />
            </div>
            <div className="inline-flex rounded-md border border-slate-300 overflow-hidden">
              {(['all', 'incomplete'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setOnly(k)}
                  className={`px-2.5 py-1.5 text-xs ${
                    only === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {k === 'all' ? 'Everyone' : 'With gaps'}
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <Download className="w-3.5 h-3.5 mr-1.5" /> CSV
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="text-sm border-collapse w-full min-w-max">
            <thead>
              <tr className="bg-slate-50">
                <th
                  className="sticky left-0 z-20 bg-slate-50 text-left px-3 py-2 border-b border-r border-slate-200 min-w-[230px]"
                  rowSpan={2}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                    Employee
                  </span>
                </th>
                <th className="text-left px-3 py-2 border-b border-slate-200 whitespace-nowrap" rowSpan={2}>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                    Joined
                  </span>
                </th>
                {groupSpans().map((g, i) => (
                  <th
                    key={i}
                    colSpan={g.span}
                    className="px-2 py-1.5 border-b border-l border-slate-200 text-center"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                      {GROUP_LABELS[g.group]}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2 border-b border-l border-slate-200 text-center" rowSpan={2}>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                    Done
                  </span>
                </th>
              </tr>
              <tr className="bg-slate-50">
                {CHECKLIST_COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    title={c.meaning}
                    className="px-1.5 py-2 border-b border-slate-200 align-bottom"
                  >
                    <span className="block text-[10px] text-slate-500 leading-tight w-[54px] mx-auto text-center">
                      {c.side === 'EMPLOYEE' ? 'Employee' : c.side === 'COMPANY' ? 'Convertt' : c.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.length === 0 ? (
                <tr>
                  <td colSpan={CHECKLIST_COLUMNS.length + 3} className="text-center text-sm text-slate-400 py-10">
                    Nobody matches that.
                  </td>
                </tr>
              ) : view.map((r) => {
                const m = merged(r)
                const prog = rowProgress(m, r.employeeType)
                const complete = prog.pct === 100
                return (
                  <tr key={r.employeeId} className="hover:bg-slate-50/60 group">
                    <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 px-3 py-2 border-b border-r border-slate-100">
                      <Link
                        href={`/dashboard/employees/${r.employeeId}`}
                        className="text-sm font-medium text-slate-900 hover:underline"
                      >
                        {r.fullName}
                      </Link>
                      <p className="text-[10px] font-mono text-slate-400">
                        {r.employeeCode}
                        {r.department && <span className="font-sans"> · {r.department}</span>}
                      </p>
                    </td>
                    <td className="px-3 py-2 border-b border-slate-100 text-[11px] text-slate-600 whitespace-nowrap">
                      {day(r.joiningDate)}
                    </td>
                    {CHECKLIST_COLUMNS.map((c) => {
                      const na = !applies(c, r.employeeType)
                      const on = m[c.key]
                      const changed = cellKey(r.employeeId, c.key) in edits
                      // Ticked, but nothing uploaded to back it up. Only shown
                      // for a stored tick — a pending edit has not been saved,
                      // so it cannot have evidence yet either way.
                      const unevidenced =
                        on && !changed && (r.unevidenced?.includes(c.key) ?? false)
                      return (
                        <td key={c.key} className="border-b border-slate-100 p-0 text-center">
                          <button
                            type="button"
                            disabled={na || !isHR}
                            onClick={() => toggle(r, c)}
                            title={na
                              ? `${c.meaning} — does not apply`
                              : unevidenced
                                ? `${c.meaning} — ticked, but no document is on file`
                                : c.meaning}
                            className={`w-full h-9 flex items-center justify-center transition-colors ${
                              na
                                ? 'text-slate-200 cursor-default'
                                : on
                                  ? unevidenced
                                    ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                  : 'text-slate-300 hover:bg-slate-100'
                            } ${changed ? 'ring-2 ring-inset ring-slate-900/25' : ''} ${
                              !isHR ? 'cursor-default' : ''
                            }`}
                          >
                            {na
                              ? <span className="text-[11px] line-through">n/a</span>
                              : on
                                ? unevidenced
                                  ? <AlertTriangle className="w-3.5 h-3.5" />
                                  : <Check className="w-4 h-4" />
                                : <span className="w-3.5 h-3.5 rounded border border-current" />}
                          </button>
                        </td>
                      )
                    })}
                    <td className="px-3 py-2 border-b border-l border-slate-100 text-center whitespace-nowrap">
                      {complete ? (
                        <span className="text-[11px] font-semibold text-emerald-700">Complete</span>
                      ) : (
                        <button
                          type="button"
                          disabled={!isHR}
                          onClick={() => completeRow(r)}
                          title={isHR ? 'Tick everything still missing on this row' : undefined}
                          className="text-[11px] tabular-nums text-slate-500 hover:text-slate-900 disabled:hover:text-slate-500"
                        >
                          {prog.done}/{prog.total}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {isHR && (
        <div className="sticky bottom-0 flex items-center justify-between gap-3 flex-wrap bg-white/95 backdrop-blur border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm">
          <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
            {dirty > 0 && <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
            {dirty > 0
              ? `${dirty} unsaved change${dirty === 1 ? '' : 's'}`
              : savedAt
                ? `Saved at ${savedAt}`
                : 'Click any cell to tick it.'}
          </p>
          <div className="flex items-center gap-2">
            {dirty > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setEdits({})}>Discard</Button>
            )}
            <Button size="sm" onClick={save} disabled={saving || dirty === 0}>
              {saving
                ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                : <Save className="w-3.5 h-3.5 mr-1.5" />}
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

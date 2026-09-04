'use client'

/**
 * The nine-box.
 *
 * Performance is read off the appraisal and cannot be typed here — if the two
 * disagreed, one of them would be wrong and nobody would know which. Potential
 * is the judgement, and it is the only thing this screen asks for.
 *
 * Anyone without a scored appraisal sits outside the grid rather than in the
 * bottom-left box. "Not assessed" and "poor" are different answers.
 */
import { useState, useEffect, useCallback } from 'react'
import { toastError, toastSuccess } from '@/components/ui/toaster'
import Link from 'next/link'
import { BOXES, AXIS_LABELS, boxFor, FLIGHT_RISK } from '@/lib/talent-grid'
import { Loader2, AlertTriangle } from 'lucide-react'

interface Row {
  employeeId: string
  fullName: string
  designation: string | null
  department: string | null
  appraisalId: string | null
  appraisalScore: number | null
  performance: number | null
  potential: number | null
  flightRisk: string | null
  successorFor: string | null
  note: string | null
}

export function TalentGridClient({ cycle }: { cycle: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Row | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/talent?cycle=${encodeURIComponent(cycle)}`)
      const d = await res.json()
      setRows(d.rows ?? [])
    } finally { setLoading(false) }
  }, [cycle])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <p className="text-sm text-slate-400 flex items-center gap-2">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading…
    </p>
  }

  const placed = rows.filter((r) => r.performance && r.potential)
  const unscored = rows.filter((r) => !r.appraisalScore)
  const needPotential = rows.filter((r) => r.appraisalScore && !r.potential)

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap gap-x-10 gap-y-3">
        <Figure label="On the grid" value={`${placed.length}`} sub={`of ${rows.length} staff`} />
        <Figure label="Awaiting a potential rating" value={`${needPotential.length}`}
          sub="appraised, not yet placed" />
        <Figure label="No appraisal score" value={`${unscored.length}`} sub="cannot be placed yet" />
        <Figure label="High flight risk"
          value={`${rows.filter((r) => r.flightRisk === 'HIGH').length}`} sub="across the company" />
      </div>

      {/* The grid. Potential up the side, performance along the bottom — the
          way it is drawn everywhere, so nobody has to re-learn it here. */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Performance against potential</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Performance comes off the appraisal score. Click a name to set potential.
          </p>
        </div>
        <div className="overflow-x-auto p-3">
          <div className="min-w-[720px]">
            {[3, 2, 1].map((pot) => (
              <div key={pot} className="flex gap-3 mb-3 last:mb-0">
                <div className="w-24 flex-shrink-0 flex items-center">
                  <span className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">
                    {AXIS_LABELS.potential[pot as 1 | 2 | 3]}
                  </span>
                </div>
                {[1, 2, 3].map((perf) => {
                  const box = boxFor(perf, pot)!
                  const here = placed.filter((r) => r.performance === perf && r.potential === pot)
                  return (
                    <div
                      key={perf}
                      className={`flex-1 min-h-[124px] rounded-lg border p-2.5 ${box.tone}`}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
                        {box.name}
                      </p>
                      <p className="text-[10px] opacity-60 mb-2">{box.action}</p>
                      <ul className="space-y-1">
                        {here.map((r) => (
                          <li key={r.employeeId}>
                            <button
                              type="button"
                              onClick={() => setEditing(r)}
                              className="text-[12px] font-medium underline-offset-2 hover:underline text-left"
                            >
                              {r.fullName}
                              {r.flightRisk === 'HIGH' && (
                                <AlertTriangle className="w-3 h-3 inline ml-1 -mt-0.5" />
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>
            ))}
            <div className="flex gap-3">
              <div className="w-24 flex-shrink-0" />
              {[1, 2, 3].map((perf) => (
                <div key={perf} className="flex-1 text-center">
                  <span className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">
                    {AXIS_LABELS.performance[perf as 1 | 2 | 3]}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-2 text-center">Performance →</p>
          </div>
        </div>
      </div>

      {/* Everyone not on it, and why — an empty grid with no explanation is
          the fastest way to have a talent review abandoned. */}
      {(needPotential.length > 0 || unscored.length > 0) && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">
              Not on the grid · {needPotential.length + unscored.length}
            </h2>
          </div>
          <ul className="divide-y divide-slate-50">
            {needPotential.map((r) => (
              <li key={r.employeeId} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <span>
                  <span className="text-sm text-slate-900">{r.fullName}</span>
                  <span className="block text-[11px] text-slate-400">
                    Appraisal {r.appraisalScore?.toFixed(1)} — needs a potential rating
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setEditing(r)}
                  className="text-[13px] px-3 py-1.5 rounded-lg bg-slate-900 text-white whitespace-nowrap"
                >
                  Set potential
                </button>
              </li>
            ))}
            {unscored.map((r) => (
              <li key={r.employeeId} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <span>
                  <span className="text-sm text-slate-700">{r.fullName}</span>
                  <span className="block text-[11px] text-slate-400">
                    No scored appraisal yet
                  </span>
                </span>
                <Link
                  href="/dashboard/performance/appraisals"
                  className="text-[13px] px-3 py-1.5 rounded-lg border border-slate-300 whitespace-nowrap"
                >
                  Appraisal forms
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editing && (
        <EditDialog
          row={editing}
          cycle={cycle}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

function EditDialog({ row, cycle, onClose, onSaved }: {
  row: Row; cycle: string; onClose: () => void; onSaved: () => void
}) {
  const [potential, setPotential] = useState<number | null>(row.potential)
  const [flightRisk, setFlightRisk] = useState<string>(row.flightRisk ?? '')
  const [successorFor, setSuccessorFor] = useState(row.successorFor ?? '')
  const [note, setNote] = useState(row.note ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/talent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: row.employeeId, cycle, potential,
          flightRisk: flightRisk || null, successorFor, note,
        }),
      })
      if (!res.ok) {
        toastError('Could not save that assessment', (await res.json().catch(() => ({}))).error)
        return
      }
      toastSuccess(`${row.fullName} placed on the grid`)
      onSaved()
    } finally { setSaving(false) }
  }

  const box = boxFor(row.performance, potential)

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl w-full max-w-lg overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">{row.fullName}</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {row.designation ?? '—'}
            {row.department ? ` · ${row.department}` : ''}
            {' · '}
            Appraisal {row.appraisalScore != null ? row.appraisalScore.toFixed(1) : 'not scored'}
            {row.performance ? ` → ${AXIS_LABELS.performance[row.performance as 1 | 2 | 3]}` : ''}
          </p>
        </div>

        <div className="px-4 py-3 space-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5">
              Potential — could they do more than this job?
            </p>
            <div className="flex gap-2">
              {[1, 2, 3].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setPotential(potential === v ? null : v)}
                  className={`flex-1 text-[13px] px-3 py-2 rounded-lg border ${
                    potential === v
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  {AXIS_LABELS.potential[v as 1 | 2 | 3]}
                </button>
              ))}
            </div>
            {box && (
              <p className="text-[11px] text-slate-500 mt-2">
                <strong className="text-slate-900">{box.name}</strong> — {box.action}
              </p>
            )}
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5">
              Flight risk
            </p>
            <div className="flex gap-2">
              {FLIGHT_RISK.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFlightRisk(flightRisk === f.value ? '' : f.value)}
                  className={`flex-1 text-[13px] px-3 py-2 rounded-lg border ${
                    flightRisk === f.value
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
              Cover for (role)
            </label>
            <input
              value={successorFor}
              onChange={(e) => setSuccessorFor(e.target.value)}
              placeholder="e.g. Lead Senior Developer"
              className="w-full text-sm rounded-lg border border-slate-200 px-3 py-1.5"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
              Note
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2"
            />
          </div>
        </div>

        <div className="px-4 py-3 border-t border-slate-100 flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="text-sm font-semibold px-4 py-2 rounded-lg bg-slate-900 text-white disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-4 py-2 rounded-lg border border-slate-300"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function Figure({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">{label}</p>
      <p className="text-xl font-bold text-slate-900 tabular-nums mt-0.5">{value}</p>
      {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
    </div>
  )
}

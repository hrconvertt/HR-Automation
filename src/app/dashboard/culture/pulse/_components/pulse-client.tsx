'use client'

/**
 * The pulse: answering it, and reading it.
 *
 * One screen for both, because they are the same round seen from two sides —
 * and because HR answers it too, and should be reminded of that before they
 * look at anyone else's answers.
 *
 * Nothing about who said what is on this page, because the endpoint does not
 * send it. Under the response floor the results are not dimmed or hidden by
 * CSS; they are absent from the payload.
 */
import { useState, useEffect, useCallback } from 'react'
import { PULSE_DRIVERS, PULSE_SCALE, ENPS_QUESTION, enpsBand } from '@/lib/pulse'
import { Loader2, ShieldCheck, Check } from 'lucide-react'

interface Round {
  id: string
  title: string
  status?: string
  opensAt: string
  closesAt: string
  _count?: { responses: number }
}

interface Results {
  round: Round
  minResponses: number
  responses: number
  invited: number
  belowFloor?: boolean
  enps?: number | null
  promoters?: number
  passives?: number
  detractors?: number
  drivers?: { key: string; label: string; average: number; favourable: number; responses: number }[]
  comments?: string[] | null
}

export function PulseClient({ isHr }: { isHr: boolean }) {
  const [open, setOpen] = useState<Round | null>(null)
  const [answered, setAnswered] = useState(false)
  const [canAnswer, setCanAnswer] = useState(false)
  const [rounds, setRounds] = useState<Round[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  const [scores, setScores] = useState<Record<string, number>>({})
  const [enps, setEnps] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)

  const [viewing, setViewing] = useState<string | null>(null)
  const [results, setResults] = useState<Results | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/pulse')
      const d = await res.json()
      setOpen(d.open ?? null)
      setAnswered(!!d.answered)
      setCanAnswer(!!d.canAnswer)
      setRounds(d.rounds ?? [])
      if (!viewing && d.rounds?.[0]) setViewing(d.rounds[0].id)
    } finally { setLoading(false) }
  }, [viewing])

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!viewing || !isHr) return
    fetch(`/api/pulse/${viewing}/results`)
      .then((r) => r.json())
      .then((d) => setResults(d.error ? null : d))
      .catch(() => setResults(null))
  }, [viewing, isHr, answered])

  async function submit() {
    if (!open) return
    setSaving(true); setMsg('')
    try {
      const res = await fetch('/api/pulse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundId: open.id, scores, enps, comment }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(d.error ?? 'Could not submit.'); return }
      setAnswered(true)
      setMsg('Thank you — your answers are in.')
    } finally { setSaving(false) }
  }

  async function newRound() {
    setSaving(true)
    try {
      await fetch('/api/pulse', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create' }),
      })
      await load()
    } finally { setSaving(false) }
  }

  async function setStatus(id: string, action: 'open' | 'close') {
    await fetch('/api/pulse', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, id }),
    })
    await load()
  }

  if (loading) {
    return <p className="text-sm text-slate-400 flex items-center gap-2">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading…
    </p>
  }

  const complete = PULSE_DRIVERS.every((d) => scores[d.key])

  return (
    <div className="space-y-4">
      {msg && <div className="bg-slate-900 text-white rounded-xl px-4 py-2.5 text-sm">{msg}</div>}

      {/* ── Answering ─────────────────────────────────────────────────── */}
      {open && canAnswer && !answered && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">{open.title}</h2>
            <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Answers are not shown to anyone individually. Nothing appears at all until
              enough people have answered to hide any one of them.
            </p>
          </div>

          <div className="divide-y divide-slate-50">
            {PULSE_DRIVERS.map((d) => (
              <div key={d.key} className="px-4 py-3">
                <p className="text-sm text-slate-800">{d.question}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {PULSE_SCALE.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setScores((p) => ({ ...p, [d.key]: s.value }))}
                      className={`text-[12px] px-2.5 py-1.5 rounded-lg border ${
                        scores[d.key] === s.value
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div className="px-4 py-3">
              <p className="text-sm text-slate-800">{ENPS_QUESTION}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {Array.from({ length: 11 }, (_, i) => i).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setEnps(n)}
                    className={`w-9 h-9 rounded-lg border text-[13px] font-medium ${
                      enps === n
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-4 py-3">
              <label className="block text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
                Anything else? (optional)
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2"
                placeholder="Read with the rest, never attributed."
              />
            </div>
          </div>

          <div className="px-4 py-3 border-t border-slate-100 flex items-center gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={saving || !complete}
              className="text-sm font-semibold px-4 py-2 rounded-lg bg-slate-900 text-white disabled:opacity-40"
            >
              {saving ? 'Submitting…' : 'Submit'}
            </button>
            <span className="text-[13px] text-slate-500">
              {complete
                ? 'All six answered.'
                : `${PULSE_DRIVERS.filter((d) => scores[d.key]).length} of ${PULSE_DRIVERS.length} answered`}
            </span>
          </div>
        </section>
      )}

      {open && answered && (
        <section className="bg-white border border-slate-200 rounded-xl px-4 py-4 flex items-center gap-2.5">
          <Check className="w-4 h-4 text-emerald-600" />
          <p className="text-sm text-slate-700">
            You have answered <strong className="text-slate-900">{open.title}</strong>. Thank you.
          </p>
        </section>
      )}

      {!open && (
        <section className="bg-white border border-slate-200 rounded-xl px-4 py-6 text-center">
          <p className="text-sm text-slate-500">No pulse is open at the moment.</p>
          {isHr && (
            <button
              type="button"
              onClick={newRound}
              disabled={saving}
              className="mt-3 text-sm font-semibold px-4 py-2 rounded-lg bg-slate-900 text-white disabled:opacity-40"
            >
              Open this quarter&apos;s pulse
            </button>
          )}
        </section>
      )}

      {/* ── Reading ───────────────────────────────────────────────────── */}
      {isHr && rounds.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-semibold text-slate-900">Results</h2>
            <div className="flex items-center gap-2">
              <select
                value={viewing ?? ''}
                onChange={(e) => setViewing(e.target.value)}
                className="text-[13px] rounded-lg border border-slate-200 px-2.5 py-1.5 bg-white"
              >
                {rounds.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title} · {r._count?.responses ?? 0} answered
                  </option>
                ))}
              </select>
              {viewing && rounds.find((r) => r.id === viewing)?.status === 'OPEN' && (
                <button
                  type="button"
                  onClick={() => setStatus(viewing, 'close')}
                  className="text-[13px] px-3 py-1.5 rounded-lg border border-slate-300"
                >
                  Close round
                </button>
              )}
              {open == null && (
                <button
                  type="button"
                  onClick={newRound}
                  disabled={saving}
                  className="text-[13px] px-3 py-1.5 rounded-lg border border-slate-300"
                >
                  New round
                </button>
              )}
            </div>
          </div>

          {!results ? (
            <p className="px-4 py-6 text-sm text-slate-400">Select a round.</p>
          ) : results.belowFloor ? (
            <div className="px-4 py-8 text-center">
              <ShieldCheck className="w-6 h-6 text-slate-300 mx-auto" />
              <p className="text-sm text-slate-700 mt-2">
                {results.responses} of {results.invited} have answered.
              </p>
              <p className="text-[13px] text-slate-500 mt-1">
                Nothing is shown until {results.minResponses} people have — below that, a score
                can be traced back to a person, and one wrong guess about that ends honest
                answers for good.
              </p>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap gap-x-10 gap-y-3">
                <Figure
                  label="eNPS"
                  value={results.enps == null ? '—' : String(results.enps)}
                  sub={enpsBand(results.enps ?? null) ?? undefined}
                />
                <Figure
                  label="Responses"
                  value={`${results.responses} of ${results.invited}`}
                  sub={`${Math.round((results.responses / Math.max(1, results.invited)) * 100)}% answered`}
                />
                <Figure label="Promoters" value={String(results.promoters ?? 0)} sub="scored 9–10" />
                <Figure label="Passives" value={String(results.passives ?? 0)} sub="scored 7–8" />
                <Figure label="Detractors" value={String(results.detractors ?? 0)} sub="scored 0–6" />
              </div>

              <ul className="divide-y divide-slate-50">
                {(results.drivers ?? []).map((d) => (
                  <li key={d.key} className="px-4 py-2.5 flex items-center gap-4">
                    <span className="w-36 text-sm text-slate-700 flex-shrink-0">{d.label}</span>
                    <span className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <span
                        className={`block h-full rounded-full ${
                          d.average >= 4 ? 'bg-emerald-500'
                            : d.average >= 3 ? 'bg-amber-400' : 'bg-red-400'
                        }`}
                        style={{ width: `${(d.average / 5) * 100}%` }}
                      />
                    </span>
                    <span className="w-28 text-right text-sm tabular-nums text-slate-900 flex-shrink-0">
                      {d.average.toFixed(1)}
                      <span className="text-slate-400 text-[11px]"> /5 · {d.favourable}%</span>
                    </span>
                  </li>
                ))}
              </ul>

              {results.comments && results.comments.length > 0 && (
                <div className="px-4 py-3 border-t border-slate-100">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
                    Comments · {results.comments.length}
                  </p>
                  <ul className="space-y-2">
                    {results.comments.map((c, i) => (
                      <li key={i} className="text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2">
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>
      )}
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

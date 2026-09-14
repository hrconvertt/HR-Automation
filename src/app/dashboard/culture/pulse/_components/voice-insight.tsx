/**
 * Insight — Peakon's engagement overview: the engagement score (as an
 * average out of 10, or as eNPS), how it moved since the previous round, the
 * eNPS split, the score over time, participation and how much the score can
 * be trusted, then the drivers to look at first and the ones going well.
 */
import Link from 'next/link'
import type { VoiceAnalysis } from '@/lib/voice-server'
import { scoreBand, MIN_RESPONSES } from '@/lib/voice'
import { enpsBand } from '@/lib/pulse'

export function VoiceInsight({ a, mode, scopeLabel, analysisHref }: {
  a: VoiceAnalysis
  mode: 'AVERAGE' | 'NPS'
  scopeLabel: string
  analysisHref: (driverKey: string) => string
}) {
  if (!a.round) {
    return <Empty>No survey rounds yet. HR opens one from Administration.</Empty>
  }
  if (a.belowFloor || !a.current) {
    return (
      <Empty>
        {a.responses} of {a.invited} have answered {a.round.title} for {scopeLabel}. Nothing is shown until {MIN_RESPONSES} have —
        below that a score can be traced back to a person.
      </Empty>
    )
  }

  const c = a.current
  const p = a.previous
  const e = c.engagement
  const value = mode === 'NPS' ? e.enps : e.average
  const prevValue = p ? (mode === 'NPS' ? p.engagement.enps : p.engagement.average) : null
  const change = value != null && prevValue != null ? Math.round((value - prevValue) * 10) / 10 : null
  const band = mode === 'NPS' ? { label: enpsBand(e.enps) ?? '', ink: (e.enps ?? 0) >= 20 ? 'text-emerald-700' : (e.enps ?? 0) >= 0 ? 'text-amber-700' : 'text-red-700' } : scoreBand(e.average)
  const pct = (n: number) => (e.answered ? Math.round((n / e.answered) * 100) : 0)
  const participation = a.invited ? Math.round((a.responses / a.invited) * 100) : 0
  const ranked = c.drivers.filter((d) => d.score != null).sort((x, y) => (x.score as number) - (y.score as number))
  const priorities = ranked.filter((d) => (d.score as number) < 7).slice(0, 3)
  const strengths = [...ranked].reverse().filter((d) => (d.score as number) >= 8).slice(0, 3)
  const prevDriver = (key: string) => p?.drivers.find((d) => d.key === key)?.score ?? null

  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr_1fr]">
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Engagement score</h3>
            <Link href={analysisHref('')} className="text-xs font-medium text-slate-700 underline">Drivers ›</Link>
          </div>
          <div className="flex items-end gap-6 flex-wrap mt-3">
            <p className={`text-7xl font-light tabular-nums leading-none ${band.ink}`}>
              {value == null ? '—' : mode === 'NPS' ? (value > 0 ? `+${value}` : value) : value.toFixed(1)}
            </p>
            <div className="pb-1">
              <p className="text-sm font-semibold text-slate-900">
                {change == null ? 'First round with enough answers' : change === 0 ? 'No change since last round' : `${Math.abs(change)} ${change > 0 ? 'up' : 'down'} since ${a.history[a.history.length - 2]?.title ?? 'last round'}`}
              </p>
              <p className="text-sm text-slate-600">{band.label}</p>
              {mode === 'AVERAGE' && value != null && (
                <div className="mt-2 w-44">
                  <div className="h-1.5 rounded bg-slate-200 overflow-hidden"><div className={`h-full ${scoreBand(value).bar}`} style={{ width: `${value * 10}%` }} /></div>
                  <div className="flex justify-between text-[10px] text-slate-400 mt-0.5"><span>0</span><span>10</span></div>
                </div>
              )}
            </div>
          </div>
          <div className="mt-5 pt-4 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-700 mb-2">eNPS distribution</p>
            <div className="flex items-center gap-5 flex-wrap">
              <span className={`w-12 h-12 rounded-full border-4 flex items-center justify-center text-xs font-bold ${(e.enps ?? 0) >= 0 ? 'border-emerald-500 text-emerald-800' : 'border-red-500 text-red-800'}`}>
                {e.enps ?? '—'}
              </span>
              <Split label="Promoters" sub="9–10" n={e.promoters} pct={pct(e.promoters)} tone="text-emerald-700" />
              <Split label="Passives" sub="7–8" n={e.passives} pct={pct(e.passives)} tone="text-slate-700" />
              <Split label="Detractors" sub="0–6" n={e.detractors} pct={pct(e.detractors)} tone="text-red-700" />
            </div>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-900">Score over time</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {a.history.length < 2 ? 'A line appears once two rounds have enough answers.' : `${a.history.length} rounds with enough answers`}
          </p>
          <TimeLine points={a.history.map((h) => ({ label: h.title, value: mode === 'NPS' ? h.enps : h.average }))} mode={mode} />
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Participation</h3>
            <p className="text-2xl font-semibold text-slate-900 mt-1">{participation}% participation rate</p>
            <p className="text-xs text-slate-500">{a.responses} of {a.invited} answered {a.round.title}.</p>
          </div>
          <div className="pt-3 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-700">Engagement score</p>
            <p className="text-xs text-slate-600">Based on answers from {e.answered} people (out of {a.invited} who could answer).</p>
          </div>
          <div className="pt-3 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-700">Score accuracy</p>
            <p className={`text-lg font-semibold ${a.accuracy === 'High' ? 'text-emerald-700' : a.accuracy === 'Medium' ? 'text-amber-700' : 'text-red-700'}`}>{a.accuracy}</p>
          </div>
        </section>
      </div>

      <section className="bg-white border border-slate-200 rounded-xl p-5 grid gap-6 lg:grid-cols-[260px_1fr]">
        <div>
          <svg className="w-14 h-14 text-blue-700" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
            <circle cx="24" cy="24" r="21" /><circle cx="24" cy="24" r="13" /><circle cx="24" cy="24" r="5" />
          </svg>
          <h3 className="text-2xl font-semibold text-slate-900 mt-3">Highlighted drivers of engagement</h3>
          <p className="text-sm text-slate-600 mt-1">Drivers measure how people feel about the things that make up their work. Start with the lowest.</p>
        </div>
        <div className="space-y-4">
          <DriverList title={`Suggested priorities · ${priorities.length}`} empty="No driver is below 7 — nothing stands out as a priority."
            rows={priorities.map((d) => ({ key: d.key, label: d.label, score: d.score as number, prev: prevDriver(d.key) }))} href={analysisHref} />
          <DriverList title={`Strengths · ${strengths.length}`} empty="No driver is at 8 or above yet."
            rows={strengths.map((d) => ({ key: d.key, label: d.label, score: d.score as number, prev: prevDriver(d.key) }))} href={analysisHref} />
        </div>
      </section>
    </div>
  )
}

function Split({ label, sub, n, pct, tone }: { label: string; sub: string; n: number; pct: number; tone: string }) {
  return (
    <div>
      <p className={`text-lg font-semibold tabular-nums ${tone}`}>{pct}%</p>
      <p className="text-xs text-slate-600">{label} ({n}) <span className="text-slate-400">· {sub}</span></p>
    </div>
  )
}

function DriverList({ title, rows, empty, href }: {
  title: string; empty: string
  rows: { key: string; label: string; score: number; prev: number | null }[]
  href: (key: string) => string
}) {
  return (
    <div className="border border-slate-200 rounded-lg">
      <p className="px-4 py-2 text-xs font-semibold text-slate-700 border-b border-slate-100">{title}</p>
      {rows.length === 0 ? <p className="px-4 py-3 text-sm text-slate-500">{empty}</p> : (
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => {
            const change = r.prev != null ? Math.round((r.score - r.prev) * 10) / 10 : null
            return (
              <li key={r.key}>
                <Link href={href(r.key)} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                  <span className="text-sm font-semibold text-slate-900">{r.label}</span>
                  <span className="text-right">
                    <span className={`text-base font-semibold tabular-nums ${scoreBand(r.score).ink}`}>{r.score.toFixed(1)}</span>
                    <span className="block text-[11px] text-slate-500">
                      {scoreBand(r.score).label}{change != null && change !== 0 ? ` · ${Math.abs(change)} ${change > 0 ? 'up' : 'down'}` : ''}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function TimeLine({ points, mode }: { points: { label: string; value: number | null }[]; mode: 'AVERAGE' | 'NPS' }) {
  const W = 300, H = 150, pad = 24
  const lo = mode === 'NPS' ? -100 : 0
  const hi = mode === 'NPS' ? 100 : 10
  const valid = points.filter((p) => p.value != null) as { label: string; value: number }[]
  const x = (i: number) => (valid.length <= 1 ? W / 2 : pad + (i * (W - pad * 2)) / (valid.length - 1))
  const y = (v: number) => H - pad - ((v - lo) / (hi - lo)) * (H - pad * 2)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-3" role="img" aria-label={valid.map((p) => `${p.label}: ${p.value}`).join(', ') || 'No data yet'}>
      {[lo, (lo + hi) / 2, hi].map((g) => (
        <g key={g}>
          <line x1={pad} x2={W - 6} y1={y(g)} y2={y(g)} stroke="#e2e8f0" strokeDasharray="3 3" />
          <text x={2} y={y(g) + 3} className="fill-slate-400" style={{ fontSize: 9 }}>{g}</text>
        </g>
      ))}
      {valid.length > 1 && (
        <polyline fill="none" stroke="#1d4ed8" strokeWidth="2" points={valid.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')} />
      )}
      {valid.map((p, i) => (
        <g key={`${p.label}-${i}`}>
          <circle cx={x(i)} cy={y(p.value)} r="4" fill="#fff" stroke="#1d4ed8" strokeWidth="2"><title>{`${p.label}: ${p.value}`}</title></circle>
          <text x={x(i)} y={H - 6} textAnchor="middle" className="fill-slate-500" style={{ fontSize: 9 }}>{p.label}</text>
        </g>
      ))}
    </svg>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="bg-white border border-slate-200 rounded-xl px-5 py-10 text-center text-sm text-slate-600">{children}</p>
}

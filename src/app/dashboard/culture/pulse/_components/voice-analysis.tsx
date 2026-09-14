/**
 * Analysis — Peakon's: drivers of engagement with their sub-drivers and a
 * jump-to list, the department heat map, every question's score, and the
 * comments.
 */
import Link from 'next/link'
import { Scale, LifeBuoy, Sprout, Award, Target, Heart } from 'lucide-react'
import type { VoiceAnalysis } from '@/lib/voice-server'
import { DRIVERS, scoreBand, MIN_RESPONSES, driverLabel } from '@/lib/voice'

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  workload: Scale, support: LifeBuoy, growth: Sprout, recognition: Award, clarity: Target, belonging: Heart,
}

type Heat = { name: string; responses: number; hidden: boolean; engagement: number | null; drivers: Record<string, number | null> }

export function VoiceAnalysisView({ a, view, heat, q, hrefFor }: {
  a: VoiceAnalysis
  view: 'drivers' | 'heatmap' | 'questions' | 'comments'
  /** Null when the viewer may not see departments (a manager's team view). */
  heat: Heat[] | null
  q: string
  hrefFor: (params: Record<string, string>) => string
}) {
  const views = [
    { key: 'drivers', label: 'Drivers' },
    ...(heat ? [{ key: 'heatmap', label: 'Heat map' }] : []),
    { key: 'questions', label: 'Question scores' },
    { key: 'comments', label: 'Comments' },
  ]

  if (!a.round) return <Empty>No survey rounds yet.</Empty>
  const floorMsg = `${a.responses} of ${a.invited} have answered ${a.round.title}. Scores and comments appear once ${MIN_RESPONSES} have.`

  return (
    <div className="space-y-4">
      <nav className="flex gap-1 flex-wrap" aria-label="Analysis views">
        {views.map((v) => (
          <Link key={v.key} href={hrefFor({ view: v.key })} aria-current={view === v.key ? 'page' : undefined}
            className={`text-sm px-3 py-1.5 rounded-lg border ${view === v.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-300 text-slate-700'}`}>
            {v.label}
          </Link>
        ))}
      </nav>

      {view === 'drivers' && (a.current ? (
        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          <aside className="space-y-4">
            <details className="bg-white border border-slate-200 rounded-lg">
              <summary className="px-3 py-2 text-sm cursor-pointer">Jump to…</summary>
              <ul className="border-t border-slate-100">
                {a.current.drivers.map((d) => (
                  <li key={d.key}>
                    <a href={`#driver-${d.key}`} className="block px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">{d.label}</a>
                    {d.subs.map((s) => <a key={s.key} href={`#driver-${d.key}`} className="block pl-7 pr-3 py-1 text-xs text-slate-500 hover:bg-slate-50 truncate">{s.text}</a>)}
                  </li>
                ))}
              </ul>
            </details>
            <div>
              <h3 className="text-2xl font-semibold text-slate-900">Drivers of engagement</h3>
              <p className="text-sm text-slate-600 mt-1">
                Drivers measure how people feel about the culture, leadership and responsibilities that make up their work. Each is the average of its questions, on 0–10.
              </p>
            </div>
          </aside>
          <ul className="space-y-3">
            {a.current.drivers.map((d) => {
              const Icon = ICONS[d.key] ?? Target
              const prev = a.previous?.drivers.find((x) => x.key === d.key)?.score ?? null
              const change = d.score != null && prev != null ? Math.round((d.score - prev) * 10) / 10 : null
              const band = scoreBand(d.score)
              return (
                <li key={d.key} id={`driver-${d.key}`} className="bg-white border border-slate-200 rounded-xl scroll-mt-4">
                  <div className="flex items-center gap-4 px-5 py-4 flex-wrap">
                    <Icon className="w-7 h-7 text-blue-700" />
                    <div className="min-w-[160px] flex-1">
                      <p className="text-base font-semibold text-slate-900 underline decoration-dotted underline-offset-4">{d.label}</p>
                      <p className="text-xs text-slate-500">{d.blurb}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-xl font-semibold tabular-nums ${band.ink}`}>
                        {change != null && change !== 0 && <span className="text-sm mr-1">{change > 0 ? '↗' : '↘'}</span>}
                        {d.score == null ? '—' : d.score.toFixed(1)}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {band.label}{change != null ? ` · ${change === 0 ? 'no change' : `${Math.abs(change)} ${change > 0 ? 'up' : 'down'}`} since last round` : ''}
                      </p>
                    </div>
                  </div>
                  {d.subs.length > 0 && (
                    <details className="border-t border-slate-100">
                      <summary className="px-5 py-2 text-sm text-slate-700 cursor-pointer">Show {d.subs.length} {d.subs.length === 1 ? 'sub-driver' : 'sub-drivers'}</summary>
                      <ul className="divide-y divide-slate-100">
                        {d.subs.map((s) => (
                          <li key={s.key} className="px-5 py-2.5 flex items-center justify-between gap-3">
                            <span className="text-sm text-slate-700">{s.text}{!s.builtIn && <span className="ml-2 text-[10px] text-slate-500 border border-slate-200 rounded px-1">custom</span>}</span>
                            <span className={`text-sm font-semibold tabular-nums ${scoreBand(s.score).ink}`}>{s.score == null ? '—' : s.score.toFixed(1)}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ) : <Empty>{floorMsg}</Empty>)}

      {view === 'heatmap' && heat && (
        heat.length === 0 ? <Empty>No answers in this round yet.</Empty> : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-100">
                  <th className="px-3 py-2 text-left font-semibold">Department</th>
                  <th className="px-3 py-2 text-right font-semibold">Answers</th>
                  <th className="px-3 py-2 text-center font-semibold">Engagement</th>
                  {DRIVERS.map((d) => <th key={d.key} className="px-3 py-2 text-center font-semibold">{d.label}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {heat.map((h) => (
                  <tr key={h.name}>
                    <td className="px-3 py-2 text-slate-900 whitespace-nowrap">{h.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{h.responses}</td>
                    {h.hidden ? (
                      <td colSpan={DRIVERS.length + 1} className="px-3 py-2 text-center text-xs text-slate-400">Hidden — fewer than {MIN_RESPONSES} answers</td>
                    ) : (
                      <>
                        <Cell v={h.engagement} />
                        {DRIVERS.map((d) => <Cell key={d.key} v={h.drivers[d.key] ?? null} />)}
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-2 text-[11px] text-slate-400 border-t border-slate-100">
              Green 8 and above · light green 7–8 · amber 6–7 · red below 6. A department with fewer than {MIN_RESPONSES} answers is hidden so nobody can be picked out.
            </p>
          </div>
        )
      )}

      {view === 'questions' && (a.current ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-100">
                <th className="px-4 py-2 text-left font-semibold">Question</th>
                <th className="px-4 py-2 text-left font-semibold">Driver</th>
                <th className="px-4 py-2 text-right font-semibold">Answers</th>
                <th className="px-4 py-2 text-right font-semibold">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {a.current.drivers.flatMap((d) => d.subs.map((s) => ({ ...s, driver: d.key })))
                .sort((x, y) => (x.score ?? 99) - (y.score ?? 99))
                .map((s) => (
                  <tr key={s.key}>
                    <td className="px-4 py-2 text-slate-800">{s.text}</td>
                    <td className="px-4 py-2 text-slate-600">{driverLabel(s.driver)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{s.responses}</td>
                    <td className={`px-4 py-2 text-right tabular-nums font-semibold ${scoreBand(s.score).ink}`}>{s.score == null ? '—' : s.score.toFixed(1)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : <Empty>{floorMsg}</Empty>)}

      {view === 'comments' && (a.comments ? (() => {
        const term = q.trim().toLowerCase()
        const list = term ? a.comments.filter((c) => c.toLowerCase().includes(term)) : a.comments
        return (
          <div className="space-y-3">
            <form method="get" className="flex gap-2">
              <input type="hidden" name="tab" value="analysis" />
              <input type="hidden" name="view" value="comments" />
              <input type="hidden" name="round" value={a.round.id} />
              <input name="q" defaultValue={q} placeholder="Search comments — e.g. workload, manager" className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              <button type="submit" className="text-sm font-semibold px-4 py-2 rounded-lg bg-slate-900 text-white">Search</button>
            </form>
            {list.length === 0 ? <Empty>{a.comments.length === 0 ? 'Nobody left a comment this round.' : 'No comment matches that.'}</Empty> : (
              <ul className="space-y-2">
                {list.map((c, i) => <li key={i} className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 whitespace-pre-wrap">{c}</li>)}
              </ul>
            )}
            <p className="text-[11px] text-slate-400">{list.length} of {a.comments.length} comments. Shown in no particular order and never attributed.</p>
          </div>
        )
      })() : <Empty>{floorMsg}</Empty>)}
    </div>
  )
}

function Cell({ v }: { v: number | null }) {
  const tone = v == null ? 'bg-slate-50 text-slate-400' : v >= 8 ? 'bg-emerald-500 text-white' : v >= 7 ? 'bg-emerald-200 text-emerald-900' : v >= 6 ? 'bg-amber-200 text-amber-900' : 'bg-red-400 text-white'
  return <td className="px-1 py-1"><span className={`block text-center rounded px-2 py-1.5 font-semibold tabular-nums ${tone}`}>{v == null ? '—' : v.toFixed(1)}</span></td>
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="bg-white border border-slate-200 rounded-xl px-5 py-10 text-center text-sm text-slate-600">{children}</p>
}

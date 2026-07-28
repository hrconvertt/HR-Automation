'use client'

/**
 * Lifecycle overview — analytical dashboard (client renderer; server page
 * gates to HR_ADMIN + EXECUTIVE).
 *
 * Data: /api/lifecycle/analytics (stage counts, 12-month headcount trend,
 * joiners vs exiters, tenure buckets, annualised attrition, department split,
 * upcoming 30-day events) + /api/lifecycle/overview (recent-activity feed).
 * Charts are hand-rolled monochrome SVG — no chart libraries, no salary data.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  Users, Sprout, ShieldCheck, DoorOpen, UserPlus, LogOut, Activity, Plane, CalendarClock, TrendingUp,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface MonthPoint { key: string; label: string; joiners: number; exiters: number; headcount: number }
interface Analytics {
  stages: { onboarding: number; probation: number; active: number; onLoa: number; offboarding: number }
  headline: {
    active: number; joinedThisMonth: number; exitedThisMonth: number
    attritionRate: number; probation: number; onLoa: number
  }
  months: MonthPoint[]
  tenureBuckets: { key: string; label: string; count: number }[]
  attrition: { rate: number; exits12mo: number; avgHeadcount: number; headcountStart: number; headcountNow: number }
  departmentSplit: { name: string; count: number }[]
  genderSplit: { male: number; female: number; other: number }
  upcoming: {
    id: string; kind: string; label: string
    employeeId: string | null; employeeName: string | null; date: string; href: string
  }[]
}
interface Overview {
  recentActivity: { id: string; type: string; title: string; employeeName: string | null; at: string }[]
}

export function LifecycleOverviewClient() {
  const [data, setData] = useState<Analytics | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    fetch('/api/lifecycle/analytics', { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then(setData)
      .catch(() => setFailed(true))
    fetch('/api/lifecycle/overview', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setOverview({ recentActivity: d.recentActivity ?? [] }))
      .catch(() => {})
  }, [])

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-6 text-white shadow-md">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-white/15 p-3 backdrop-blur">
            <Users className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">Employee Lifecycle — Overview</h1>
            <p className="text-white/85 mt-1 text-sm">
              Headcount, movement and attrition across the whole journey — joining to exit.
            </p>
          </div>
        </div>
      </div>

      {failed ? (
        <Card><CardContent className="py-10 text-center text-slate-400">Failed to load analytics.</CardContent></Card>
      ) : !data ? (
        <Card><CardContent className="py-10 text-center text-slate-400">Loading…</CardContent></Card>
      ) : (
        <>
          {/* Headline chips */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatChip icon={Users}      label="Active"            value={data.headline.active} href="/dashboard/employees" />
            <StatChip icon={ShieldCheck} label="On Probation"     value={data.headline.probation} href="/dashboard/probation" />
            <StatChip icon={Plane}      label="On LOA"            value={data.headline.onLoa} href="/dashboard/lifecycle/loa" />
            <StatChip icon={UserPlus}   label="Joined This Month" value={data.headline.joinedThisMonth} />
            <StatChip icon={LogOut}     label="Exited This Month" value={data.headline.exitedThisMonth} />
            <StatChip icon={TrendingUp} label="Attrition (12 mo)" value={`${data.headline.attritionRate}%`} />
          </div>

          {/* Lifecycle funnel */}
          <Card>
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="text-base">Lifecycle funnel</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <Funnel stages={data.stages} />
            </CardContent>
          </Card>

          {/* Trend charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="border-b border-slate-100">
                <CardTitle className="text-base">Headcount — last 12 months</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <HeadcountTrend months={data.months} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="border-b border-slate-100">
                <CardTitle className="text-base">Joiners vs exiters — last 6 months</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <JoinersExiters months={data.months.slice(-6)} />
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Tenure */}
            <Card>
              <CardHeader className="border-b border-slate-100">
                <CardTitle className="text-base">Tenure distribution</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <HBarChart
                  rows={data.tenureBuckets.map((b) => ({ label: b.label, value: b.count }))}
                  empty="No employees yet."
                />
              </CardContent>
            </Card>

            {/* Departments */}
            <Card>
              <CardHeader className="border-b border-slate-100">
                <CardTitle className="text-base">Headcount by department</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <HBarChart
                  rows={data.departmentSplit.map((d) => ({ label: d.name, value: d.count }))}
                  empty="No department data."
                />
              </CardContent>
            </Card>

            {/* Attrition detail */}
            <Card>
              <CardHeader className="border-b border-slate-100">
                <CardTitle className="text-base">Attrition</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <p className="text-3xl font-bold text-slate-900 tabular-nums">{data.attrition.rate}%</p>
                <p className="text-xs text-slate-500 mt-1">
                  trailing 12 months, annualised
                </p>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Exits (12 mo)</dt>
                    <dd className="text-slate-900 font-medium tabular-nums">{data.attrition.exits12mo}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Avg headcount</dt>
                    <dd className="text-slate-900 font-medium tabular-nums">{data.attrition.avgHeadcount}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Headcount, 12 mo ago → now</dt>
                    <dd className="text-slate-900 font-medium tabular-nums">
                      {data.attrition.headcountStart} → {data.attrition.headcountNow}
                    </dd>
                  </div>
                </dl>
                <p className="text-xs text-slate-400 mt-4 border-t border-slate-100 pt-3">
                  Formula: exits in the last 12 months ÷ average headcount
                  ((start + now) / 2). A 12-month window is already annual, so
                  no further annualisation factor is applied.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Upcoming 30 days */}
            <Card>
              <CardHeader className="border-b border-slate-100 flex flex-row items-center gap-2">
                <CalendarClock className="w-4 h-4 text-slate-500" />
                <CardTitle className="text-base">Next 30 days</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                {data.upcoming.length === 0 ? (
                  <p className="text-sm text-slate-400">Nothing due in the next 30 days.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {data.upcoming.map((u) => (
                      <li key={u.id} className="py-2 flex items-center gap-3 text-sm">
                        <span className="text-xs text-slate-400 w-16 shrink-0 tabular-nums">{formatDate(u.date)}</span>
                        <span className="flex-1 min-w-0">
                          {u.employeeId ? (
                            <Link href={`/dashboard/employees/${u.employeeId}`} className="text-slate-900 font-medium hover:underline">
                              {u.employeeName ?? '—'}
                            </Link>
                          ) : (
                            <span className="text-slate-900 font-medium">{u.employeeName ?? '—'}</span>
                          )}
                          <span className="text-slate-500"> · {u.label}</span>
                        </span>
                        <Link href={u.href} className="text-xs text-slate-600 hover:underline shrink-0">Open →</Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Recent activity */}
            <Card>
              <CardHeader className="border-b border-slate-100 flex flex-row items-center gap-2">
                <Activity className="w-4 h-4 text-slate-500" />
                <CardTitle className="text-base">Recent activity</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                {!overview || overview.recentActivity.length === 0 ? (
                  <p className="text-sm text-slate-400">No recent lifecycle events.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {overview.recentActivity.map((e) => (
                      <li key={e.id} className="py-2 flex items-start gap-3 text-sm">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 mt-0.5 w-24 shrink-0">
                          {e.type}
                        </span>
                        <span className="flex-1">
                          <span className="text-slate-800">{e.title}</span>
                          {e.employeeName && <span className="text-slate-500"> · {e.employeeName}</span>}
                        </span>
                        <span className="text-xs text-slate-400 shrink-0">{formatDate(e.at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

// ── Building blocks ──────────────────────────────────────────────────────────

function StatChip({ icon: Icon, label, value, href }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number | string
  href?: string
}) {
  const inner = (
    <div className="rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300 transition-colors h-full">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <Icon className="w-4 h-4 text-slate-400" />
      </div>
      <p className="text-2xl font-bold text-slate-900 mt-2 tabular-nums">{value}</p>
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

/** Horizontal lifecycle funnel — each stage clickable to its module. */
function Funnel({ stages }: { stages: Analytics['stages'] }) {
  const steps = [
    { key: 'onboarding', label: 'Onboarding', count: stages.onboarding, icon: Sprout, href: '/dashboard/onboarding' },
    { key: 'probation', label: 'Probation', count: stages.probation, icon: ShieldCheck, href: '/dashboard/probation' },
    { key: 'active', label: 'Active', count: stages.active, icon: Users, href: '/dashboard/employees' },
    { key: 'offboarding', label: 'Offboarding', count: stages.offboarding, icon: DoorOpen, href: '/dashboard/lifecycle/exit' },
  ]
  const max = Math.max(1, ...steps.map((s) => s.count))
  return (
    <div>
      <div className="flex flex-col sm:flex-row items-stretch gap-2">
        {steps.map((s, i) => {
          const intensity = s.count / max // 0..1 — darker = more people
          return (
            <div key={s.key} className="flex-1 flex items-center gap-2 min-w-0">
              <Link
                href={s.href}
                className="flex-1 rounded-xl border border-slate-200 hover:border-slate-400 transition-colors p-4 text-center relative overflow-hidden"
                title={`${s.label}: ${s.count} — open module`}
              >
                <div
                  className="absolute inset-x-0 bottom-0 bg-slate-900/[0.06]"
                  style={{ height: `${Math.round(intensity * 100)}%` }}
                  aria-hidden
                />
                <s.icon className="w-4 h-4 text-slate-400 mx-auto relative" />
                <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums relative">{s.count}</p>
                <p className="text-xs font-medium text-slate-500 relative">{s.label}</p>
              </Link>
              {i < steps.length - 1 && (
                <span className="hidden sm:block text-slate-300 shrink-0" aria-hidden>→</span>
              )}
            </div>
          )
        })}
      </div>
      {stages.onLoa > 0 && (
        <p className="text-xs text-slate-500 mt-3">
          Plus{' '}
          <Link href="/dashboard/lifecycle/loa" className="font-medium text-slate-700 underline">
            {stages.onLoa} on leave of absence
          </Link>{' '}
          (counted within Active).
        </p>
      )}
    </div>
  )
}

/** 12-month headcount line + area (monochrome SVG). */
function HeadcountTrend({ months }: { months: MonthPoint[] }) {
  const width = 700
  const height = 200
  const padding = { top: 14, right: 12, bottom: 24, left: 34 }
  const innerW = width - padding.left - padding.right
  const innerH = height - padding.top - padding.bottom
  if (months.length === 0 || months.every((m) => m.headcount === 0)) {
    return <p className="text-sm text-slate-400">No headcount history yet.</p>
  }
  const maxY = Math.max(1, ...months.map((m) => m.headcount))
  const x = (i: number) => padding.left + (months.length <= 1 ? 0 : (i / (months.length - 1)) * innerW)
  const y = (v: number) => padding.top + innerH - (v / maxY) * innerH
  const linePath = months.map((m, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(m.headcount).toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${x(months.length - 1).toFixed(1)},${(padding.top + innerH).toFixed(1)} L${padding.left},${(padding.top + innerH).toFixed(1)} Z`
  const ticks = [0, Math.round(maxY / 2), maxY]
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padding.left} x2={padding.left + innerW} y1={y(t)} y2={y(t)} stroke="#e5e7eb" strokeDasharray="2 3" />
          <text x={padding.left - 6} y={y(t) + 3} fontSize={9} textAnchor="end" fill="#6b7280">{t}</text>
        </g>
      ))}
      <path d={areaPath} fill="#111827" opacity={0.06} />
      <path d={linePath} fill="none" stroke="#111827" strokeWidth={1.8} />
      {months.map((m, i) => (
        <circle key={m.key} cx={x(i)} cy={y(m.headcount)} r={3} fill="#111827">
          <title>{`${m.label} — headcount ${m.headcount} (+${m.joiners} / −${m.exiters})`}</title>
        </circle>
      ))}
      {months.map((m, i) => (
        (i === 0 || i === months.length - 1 || i % 3 === 0) && (
          <text key={`x-${m.key}`} x={x(i)} y={height - 6} fontSize={9} textAnchor="middle" fill="#6b7280">{m.label}</text>
        )
      ))}
    </svg>
  )
}

/** Grouped bars: joiners (solid) vs exiters (outlined) per month. */
function JoinersExiters({ months }: { months: MonthPoint[] }) {
  const width = 700
  const height = 200
  const padding = { top: 14, right: 12, bottom: 24, left: 28 }
  const innerW = width - padding.left - padding.right
  const innerH = height - padding.top - padding.bottom
  const maxY = Math.max(1, ...months.map((m) => Math.max(m.joiners, m.exiters)))
  if (months.length === 0 || months.every((m) => m.joiners === 0 && m.exiters === 0)) {
    return <p className="text-sm text-slate-400">No joins or exits in this window.</p>
  }
  const groupW = innerW / months.length
  const barW = Math.min(26, groupW * 0.32)
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        <line x1={padding.left} x2={padding.left + innerW} y1={padding.top + innerH} y2={padding.top + innerH} stroke="#d1d5db" />
        {[0, Math.round(maxY / 2), maxY].map((t) => {
          const py = padding.top + innerH - (t / maxY) * innerH
          return (
            <g key={t}>
              <text x={padding.left - 6} y={py + 3} fontSize={9} textAnchor="end" fill="#6b7280">{t}</text>
              {t > 0 && <line x1={padding.left} x2={padding.left + innerW} y1={py} y2={py} stroke="#e5e7eb" strokeDasharray="2 3" />}
            </g>
          )
        })}
        {months.map((m, i) => {
          const cx = padding.left + i * groupW + groupW / 2
          const jh = (m.joiners / maxY) * innerH
          const eh = (m.exiters / maxY) * innerH
          return (
            <g key={m.key}>
              <rect x={cx - barW - 2} y={padding.top + innerH - jh} width={barW} height={jh} fill="#111827">
                <title>{`${m.label} — ${m.joiners} joined`}</title>
              </rect>
              <rect
                x={cx + 2} y={padding.top + innerH - eh} width={barW} height={Math.max(eh, 0)}
                fill="#ffffff" stroke="#111827" strokeWidth={1.2}
              >
                <title>{`${m.label} — ${m.exiters} exited`}</title>
              </rect>
              <text x={cx} y={height - 6} fontSize={9} textAnchor="middle" fill="#6b7280">{m.label}</text>
            </g>
          )
        })}
      </svg>
      <div className="flex items-center gap-4 mt-2 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 bg-slate-900 rounded-sm inline-block" /> Joiners</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 bg-white border border-slate-900 rounded-sm inline-block" /> Exiters</span>
      </div>
    </div>
  )
}

/** Simple horizontal bar list (label · bar · count). */
function HBarChart({ rows, empty }: { rows: { label: string; value: number }[]; empty: string }) {
  const total = rows.reduce((s, r) => s + r.value, 0)
  if (rows.length === 0 || total === 0) return <p className="text-sm text-slate-400">{empty}</p>
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-sm" title={`${r.label}: ${r.value}`}>
          <span className="w-24 shrink-0 text-xs text-slate-500 truncate">{r.label}</span>
          <div className="flex-1 h-4 bg-slate-100 rounded overflow-hidden">
            <div className="h-full bg-slate-900 rounded" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
          <span className="w-8 text-right text-xs font-semibold text-slate-900 tabular-nums">{r.value}</span>
        </div>
      ))}
    </div>
  )
}

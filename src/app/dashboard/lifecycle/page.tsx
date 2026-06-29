'use client'

/**
 * Employee Lifecycle — overview landing page.
 *
 * Sub-modules (Onboarding · Probation · Active · Exit Clearance) are now
 * reached via the nested sidebar — this page is purely an analytics
 * dashboard showing headline KPIs + recent activity.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Sprout, Users, DoorOpen, ShieldCheck, UserPlus, LogOut, Activity } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface OverviewData {
  counts: {
    onboarding: number
    probation: number
    active: number
    exitClearance: number
    joinedThisMonth: number
    exitedThisMonth: number
  }
  joiningThisMonth: { id: string; fullName: string; designation: string; joiningDate: string }[]
  exitingThisMonth: { id: string; fullName: string; designation: string; lastWorkingDay: string | null }[]
  recentActivity: {
    id: string
    type: string
    title: string
    employeeName: string | null
    at: string
  }[]
}

export default function LifecyclePage() {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/lifecycle/overview')
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
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
              From joining to exit — pick a sub-module from the sidebar to act on a stage.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <Card><CardContent className="py-10 text-center text-slate-400">Loading…</CardContent></Card>
      ) : !data ? (
        <Card><CardContent className="py-10 text-center text-slate-400">Failed to load overview.</CardContent></Card>
      ) : (
        <>
          {/* KPI tiles */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiTile icon={Sprout}      label="In Onboarding"     value={data.counts.onboarding}      href="/dashboard/onboarding" />
            <KpiTile icon={ShieldCheck} label="On Probation"      value={data.counts.probation}       href="/dashboard/probation" />
            <KpiTile icon={Users}       label="Active"            value={data.counts.active}          href="/dashboard/employees" />
            <KpiTile icon={DoorOpen}    label="In Exit Clearance" value={data.counts.exitClearance}   href="/dashboard/lifecycle/exit" />
            <KpiTile icon={UserPlus}    label="Joined This Month" value={data.counts.joinedThisMonth} />
            <KpiTile icon={LogOut}      label="Exited This Month" value={data.counts.exitedThisMonth} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="border-b border-slate-100 flex flex-row items-center justify-between">
                <CardTitle className="text-base">Joining this month</CardTitle>
                <Link href="/dashboard/onboarding" className="text-xs text-slate-700 hover:underline">Onboarding →</Link>
              </CardHeader>
              <CardContent className="p-4">
                {data.joiningThisMonth.length === 0 ? (
                  <p className="text-sm text-slate-400">No new hires this month.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.joiningThisMonth.map((e) => (
                      <li key={e.id} className="flex items-center justify-between text-sm">
                        <Link href={`/dashboard/employees/${e.id}`} className="text-slate-800 hover:underline">
                          {e.fullName}
                        </Link>
                        <span className="text-xs text-slate-500">{e.designation} · {formatDate(e.joiningDate)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b border-slate-100 flex flex-row items-center justify-between">
                <CardTitle className="text-base">Exiting this month</CardTitle>
                <Link href="/dashboard/lifecycle/exit" className="text-xs text-slate-700 hover:underline">Exit Clearance →</Link>
              </CardHeader>
              <CardContent className="p-4">
                {data.exitingThisMonth.length === 0 ? (
                  <p className="text-sm text-slate-400">No exits this month.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.exitingThisMonth.map((e) => (
                      <li key={e.id} className="flex items-center justify-between text-sm">
                        <Link href={`/dashboard/employees/${e.id}`} className="text-slate-800 hover:underline">
                          {e.fullName}
                        </Link>
                        <span className="text-xs text-slate-500">{e.designation}{e.lastWorkingDay ? ` · ${formatDate(e.lastWorkingDay)}` : ''}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="border-b border-slate-100 flex flex-row items-center gap-2">
              <Activity className="w-4 h-4 text-slate-500" />
              <CardTitle className="text-base">Recent activity</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {data.recentActivity.length === 0 ? (
                <p className="text-sm text-slate-400">No recent lifecycle events.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.recentActivity.map((e) => (
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
        </>
      )}
    </div>
  )
}

function KpiTile({ icon: Icon, label, value, href }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: number; href?: string
}) {
  const inner = (
    <div className="rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300 transition-colors">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <Icon className="w-4 h-4 text-slate-400" />
      </div>
      <p className="text-2xl font-bold text-slate-900 mt-2 tabular-nums">{value}</p>
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

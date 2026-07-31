import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { ShieldCheck, CalendarClock, AlertTriangle, ArrowRight } from 'lucide-react'

/**
 * Probation board — the view behind `/dashboard/probation`.
 *
 * `/dashboard/probation` redirects to `/dashboard/lifecycle?tab=probation`, but
 * the lifecycle page ignored `?tab` and rendered the overview regardless, so
 * clicking Probation looked like it did nothing. This is the view that param
 * now selects.
 *
 * Shows everyone currently ON probation, soonest decision first — the point of
 * the screen is "who needs a confirm/extend decision, and when".
 */

const DAY = 86400000

function fmt(d: Date) {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export async function ProbationBoard() {
  const today = new Date()

  const records = await prisma.probationRecord.findMany({
    where: {
      status: { in: ['ACTIVE', 'UNDER_REVIEW', 'EXTENDED', 'WARNED'] },
      employee: { status: { notIn: ['RESIGNED', 'TERMINATED', 'INACTIVE', 'LAYOFF'] } },
    },
    include: {
      employee: {
        select: {
          id: true, fullName: true, employeeCode: true, designation: true,
          joiningDate: true, status: true,
          department: { select: { name: true } },
          reportingManager: { select: { fullName: true } },
        },
      },
    },
    orderBy: { endDate: 'asc' },
  })

  const overdue = records.filter((r) => r.endDate < today)
  const dueSoon = records.filter((r) => r.endDate >= today && (r.endDate.getTime() - today.getTime()) / DAY <= 14)

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-slate-700" />
          On Probation
        </h2>
        <p className="text-xs text-slate-500">
          <span className="font-semibold text-slate-900 tabular-nums">{records.length}</span>
          {records.length === 1 ? ' new hire' : ' new hires'}
          {dueSoon.length > 0 && <> · <span className="font-semibold text-slate-900">{dueSoon.length}</span> due within 14 days</>}
          {overdue.length > 0 && <> · <span className="font-semibold text-slate-900">{overdue.length}</span> past end date</>}
        </p>
      </div>

      {records.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white py-14 text-center">
          <ShieldCheck className="w-7 h-7 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-700">Nobody is on probation</p>
          <p className="text-xs text-slate-400 mt-1">New hires appear here until their probation is confirmed or extended.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {records.map((r) => {
            const daysIn = Math.floor((today.getTime() - r.employee.joiningDate.getTime()) / DAY)
            const daysLeft = Math.ceil((r.endDate.getTime() - today.getTime()) / DAY)
            const total = Math.max(1, Math.round((r.endDate.getTime() - r.startDate.getTime()) / DAY))
            const pct = Math.max(0, Math.min(100, Math.round((daysIn / total) * 100)))
            const isOverdue = daysLeft < 0
            const isSoon = !isOverdue && daysLeft <= 14

            return (
              <Link
                key={r.id}
                href={`/dashboard/probation/${r.employee.id}`}
                className="group rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-400 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{r.employee.fullName}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {r.employee.designation}
                      {r.employee.department?.name ? ` · ${r.employee.department.name}` : ''}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
                      isOverdue
                        ? 'bg-slate-900 text-white border-slate-900'
                        : isSoon
                          ? 'bg-slate-100 text-slate-900 border-slate-300'
                          : 'bg-slate-50 text-slate-500 border-slate-200'
                    }`}
                  >
                    {r.status.replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="mt-3">
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-slate-700" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex items-center justify-between mt-1.5 text-[11px] tabular-nums">
                    <span className="text-slate-500">{daysIn}d in · joined {fmt(r.employee.joiningDate)}</span>
                    <span className={isOverdue || isSoon ? 'font-semibold text-slate-900' : 'text-slate-500'}>
                      {isOverdue ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`}
                    </span>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-slate-500 truncate flex items-center gap-1.5">
                    {isOverdue ? (
                      <AlertTriangle className="w-3 h-3 shrink-0 text-slate-700" />
                    ) : (
                      <CalendarClock className="w-3 h-3 shrink-0 text-slate-400" />
                    )}
                    Decision due {fmt(r.endDate)}
                  </p>
                  <span className="text-[11px] text-slate-400 group-hover:text-slate-700 flex items-center gap-0.5 shrink-0">
                    Review <ArrowRight className="w-3 h-3" />
                  </span>
                </div>

                {r.employee.reportingManager?.fullName && (
                  <p className="text-[10px] text-slate-400 mt-2 truncate">
                    Manager: {r.employee.reportingManager.fullName}
                  </p>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

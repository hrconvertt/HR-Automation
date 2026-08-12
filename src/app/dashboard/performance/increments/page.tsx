/**
 * Increments — where everyone stands on pay, and who is overdue.
 *
 * Worked entirely from CompensationHistory, which already holds 246 rows of
 * real increments. Nothing here is entered twice: the last raise, what it was
 * worth, and when the next one falls due all come off the same history the
 * increment letters are generated from.
 *
 * Convertt's stated cycle is annual, with a first review six months after
 * joining. So someone with no increment yet is measured from their joining
 * date at six months, and everyone else from their last increment at twelve.
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isFounder } from '@/lib/review-scope'
import Link from 'next/link'
import { INCREMENT_RULES, ruleRange, type IncrementTrack } from '@/lib/pay-split'
import { TrackPicker, TrackBand } from './_components/track-picker'

const FIRST_REVIEW_MONTHS = 6
const CYCLE_MONTHS = 12

const pkr = (n: number) => 'PKR ' + Math.round(n).toLocaleString('en-PK')

const day = (d: Date | null) =>
  d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

function addMonths(d: Date, months: number): Date {
  const c = new Date(d)
  c.setMonth(c.getMonth() + months)
  return c
}

const monthsBetween = (a: Date, b: Date) =>
  (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())

export default async function IncrementsPage() {
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')
  const role = cookieStore.get('hr_preview_role')?.value ?? payload.role
  if (role !== 'HR_ADMIN' && role !== 'EXECUTIVE') redirect('/dashboard/performance')

  const [employees, history] = await Promise.all([
    prisma.employee.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true, fullName: true, employeeCode: true, designation: true,
        joiningDate: true, incrementTrack: true, department: { select: { name: true } },
        salary: {
          select: {
            basic: true, houseRent: true, utilities: true, food: true,
            fuel: true, medicalAllowance: true, otherAllowance: true,
          },
        },
      },
      orderBy: { fullName: 'asc' },
    }),
    prisma.compensationHistory.findMany({
      where: { type: { in: ['INCREMENT', 'PROMOTION'] } },
      orderBy: { effectiveDate: 'desc' },
      select: {
        employeeId: true, type: true, oldSalary: true, newSalary: true,
        incrementPct: true, effectiveDate: true, reason: true,
      },
    }),
  ])

  const lastByEmployee = new Map<string, (typeof history)[number]>()
  for (const h of history) {
    if (!lastByEmployee.has(h.employeeId)) lastByEmployee.set(h.employeeId, h)
  }

  const today = new Date()
  const rows = employees.filter((e) => !isFounder(e.designation)).map((e) => {
    const s = e.salary
    const current = s
      ? s.basic + s.houseRent + s.utilities + s.food + s.fuel + s.medicalAllowance + s.otherAllowance
      : 0
    const last = lastByEmployee.get(e.id) ?? null

    // No increment yet means the clock runs from joining, at six months.
    const anchor = last?.effectiveDate ?? e.joiningDate
    // Their own cycle decides the wait — six-monthly and annual are not the
    // same gap, so a fixed twelve months would have shown half the company a
    // date six months later than it really is.
    const cycle = INCREMENT_RULES[
      (e.incrementTrack === 'BIANNUAL' ? 'BIANNUAL' : 'ANNUAL') as IncrementTrack
    ].cycleMonths ?? CYCLE_MONTHS
    const window = last ? cycle : FIRST_REVIEW_MONTHS
    const dueDate = anchor ? addMonths(anchor, window) : null
    const monthsSince = anchor ? monthsBetween(anchor, today) : null
    const overdueBy = dueDate ? monthsBetween(dueDate, today) : null

    const rise = last ? last.newSalary - last.oldSalary : null
    const pct = last
      ? (last.incrementPct ?? (last.oldSalary > 0 ? (rise! / last.oldSalary) * 100 : null))
      : null

    return {
      ...e, current, last, dueDate, monthsSince, overdueBy, rise, pct,
      neverRaised: !last,
    }
  })

  const due = rows.filter((r) => (r.overdueBy ?? -99) >= 0)
  const totalCurrent = rows.reduce((n, r) => n + r.current, 0)
  const raisedThisYear = history.filter(
    (h) => h.effectiveDate.getFullYear() === today.getFullYear(),
  )
  const avgPct = (() => {
    const withPct = rows.map((r) => r.pct).filter((v): v is number => v != null && v > 0)
    return withPct.length ? withPct.reduce((a, b) => a + b, 0) / withPct.length : null
  })()

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Increments</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Where every active employee stands on pay, and who is due a review.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Due or overdue" value={String(due.length)} sub={`of ${rows.length} active`} />
        <Stat label="Raised this year" value={String(raisedThisYear.length)} sub={`in ${today.getFullYear()}`} />
        <Stat label="Average rise" value={avgPct != null ? `${avgPct.toFixed(1)}%` : '—'} sub="last increment each" />
        <Stat label="Monthly payroll" value={pkr(totalCurrent)} sub="gross, active staff" />
      </div>

      {/* The bands, stated once. Nobody should be recalling these from memory
          in the middle of a review. */}
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">What a raise is worth</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Starting figures, not a cap — the number can always be set higher or lower.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          {(Object.keys(INCREMENT_RULES) as IncrementTrack[]).map((track) => {
            const rule = INCREMENT_RULES[track]
            return (
              <div key={track} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                    {rule.label}
                  </p>
                  {rule.discretionary && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-200">
                      Optional
                    </span>
                  )}
                </div>
                <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                  {ruleRange(track)}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {rule.cycleMonths == null
                    ? 'Once, when probation ends'
                    : `Every ${rule.cycleMonths} months`}
                </p>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{rule.note}</p>
              </div>
            )
          })}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Everyone · {rows.length}</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            First review falls {FIRST_REVIEW_MONTHS} months after joining, then every {CYCLE_MONTHS}.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <Th>Employee</Th><Th right>Current</Th><Th>Track</Th><Th right>Band</Th>
                <Th>Last increment</Th><Th right>Rise</Th><Th right>%</Th>
                <Th>Next due</Th><Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const overdue = (r.overdueBy ?? -99) >= 0
                return (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/dashboard/performance/increments/${r.id}`}
                        className="text-slate-900 font-medium hover:underline"
                      >
                        {r.fullName}
                      </Link>
                      <p className="text-[11px] text-slate-500">
                        {r.designation ?? r.employeeCode}
                        {r.department?.name ? ` · ${r.department.name}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap text-slate-900">
                      {r.current ? pkr(r.current) : <span className="text-slate-400">not set</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <TrackPicker employeeId={r.id} value={r.incrementTrack} />
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <TrackBand value={r.incrementTrack} />
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                      {r.last ? (
                        <>
                          {day(r.last.effectiveDate)}
                          <span className="block text-[11px] text-slate-400">
                            {r.last.type === 'PROMOTION' ? 'Promotion' : 'Increment'}
                            {r.monthsSince != null ? ` · ${r.monthsSince}m ago` : ''}
                          </span>
                        </>
                      ) : (
                        <span className="text-slate-400">
                          none yet
                          <span className="block text-[11px]">joined {day(r.joiningDate)}</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap text-slate-600">
                      {r.rise != null && r.rise !== 0 ? pkr(r.rise) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap text-slate-600">
                      {r.pct != null ? `${r.pct.toFixed(1)}%` : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{day(r.dueDate)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`inline-block text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                        overdue
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-slate-50 text-slate-500 border-slate-200'
                      }`}>
                        {overdue
                          ? (r.overdueBy === 0 ? 'Due now' : `${r.overdueBy}m overdue`)
                          : 'On track'}
                      </span>
                      {r.neverRaised && (
                        <span className="block text-[11px] text-slate-400 mt-0.5">first review</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-slate-400">
        Current pay is the sum of the salary components on record, which is what payroll uses.
        The percentage is the one stored with the increment where there is one, and worked from
        the old and new figures where there is not.
      </p>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-xl font-bold text-slate-900 mt-1 tabular-nums">{value}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>
    </div>
  )
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-2 text-[11px] uppercase tracking-wider text-slate-500 font-semibold whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { formatDate } from '@/lib/utils'

/**
 * Probation Period Tracker — every probation, not just the live ones.
 *
 * The lifecycle board deliberately shows only who is currently on probation,
 * which meant the imported review data (ratings, manager comments, recommended
 * action, post-probation salary, confirmation date) had nowhere to appear once
 * a record was confirmed. This is that view: the same columns as the master
 * sheet's tracker tab, with the name opening the full record.
 */
export default async function ProbationTrackerPage() {
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true },
  })
  const previewRole = me?.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? me?.role
  if (!['HR_ADMIN', 'EXECUTIVE', 'MANAGER'].includes(effectiveRole ?? '')) {
    return (
      <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl">
        <h2 className="text-lg font-semibold text-slate-900">Access denied</h2>
        <p className="text-sm text-slate-600 mt-2">The probation tracker is HR and management only.</p>
      </div>
    )
  }

  const records = await prisma.probationRecord.findMany({
    select: {
      id: true, status: true, startDate: true, endDate: true,
      performanceRating: true, managerNotes: true, hrDecision: true,
      salaryBumpAmount: true, outcomeDate: true,
      employee: {
        select: {
          id: true, fullName: true, employeeCode: true, designation: true,
          employeeType: true, department: { select: { name: true } },
        },
      },
    },
    orderBy: [{ status: 'asc' }, { endDate: 'desc' }],
  })

  const live = records.filter((r) => ['ACTIVE', 'UNDER_REVIEW'].includes(r.status))
  const closed = records.filter((r) => !['ACTIVE', 'UNDER_REVIEW'].includes(r.status))
  const today = new Date()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Probation Period Tracker</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          {live.length} in progress · {closed.length} closed · click a name for the full record
        </p>
      </div>

      <Section title="In progress" rows={live} today={today} empty="Nobody is on probation." />
      <Section title="Closed" rows={closed} today={today} empty="No completed probations yet." />
    </div>
  )
}

type Row = {
  id: string
  status: string
  startDate: Date
  endDate: Date
  performanceRating: number | null
  managerNotes: string | null
  hrDecision: string | null
  salaryBumpAmount: number | null
  outcomeDate: Date | null
  employee: {
    id: string
    fullName: string
    employeeCode: string
    designation: string | null
    employeeType: string
    department: { name: string } | null
  }
}

const STATUS_TONE: Record<string, string> = {
  ACTIVE: 'bg-slate-100 text-slate-700',
  UNDER_REVIEW: 'bg-amber-100 text-amber-800',
  CONFIRMED: 'bg-emerald-100 text-emerald-800',
  EXTENDED: 'bg-blue-100 text-blue-800',
  TERMINATED: 'bg-red-100 text-red-800',
  WARNED: 'bg-orange-100 text-orange-800',
}

const DECISION_LABEL: Record<string, string> = {
  CONFIRM: 'Confirm Permanent',
  EXTEND: 'Extend',
  TERMINATE: 'Terminate',
  WARNING: 'Warning',
}

function Section({ title, rows, today, empty }: {
  title: string; rows: Row[]; today: Date; empty: string
}) {
  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{title}</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-[12px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <Th>Employee</Th>
              <Th>Designation</Th>
              <Th>Probation</Th>
              <Th right>Days left</Th>
              <Th right>Rating</Th>
              <Th>Recommended action</Th>
              <Th right>Salary after prob.</Th>
              <Th>Confirmed</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} className="py-8 text-center text-slate-400">{empty}</td></tr>
            ) : rows.map((r) => {
              const daysLeft = Math.ceil((r.endDate.getTime() - today.getTime()) / 86400000)
              const live = ['ACTIVE', 'UNDER_REVIEW'].includes(r.status)
              return (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/60 align-top">
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/dashboard/probation/${r.employee.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {r.employee.fullName}
                    </Link>
                    <div className="text-[11px] text-slate-400">
                      {r.employee.employeeCode}
                      {r.employee.department?.name ? ` · ${r.employee.department.name}` : ''}
                    </div>
                    {r.managerNotes && (
                      // Long month-by-month notes exist in the sheet; show the
                      // first line so the table stays scannable, full text is
                      // on the record itself.
                      <div className="text-[11px] text-slate-500 mt-1 max-w-[22rem] truncate" title={r.managerNotes}>
                        {r.managerNotes.split('\n')[0]}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-slate-700">{r.employee.designation ?? '—'}</td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">
                    {formatDate(r.startDate)} – {formatDate(r.endDate)}
                  </td>
                  <td className={`px-3 py-2.5 text-right whitespace-nowrap ${live && daysLeft < 0 ? 'text-red-600 font-semibold' : 'text-slate-600'}`}>
                    {live ? (daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d`) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-700">
                    {r.performanceRating != null ? `${r.performanceRating}/5` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-slate-700">
                    {r.hrDecision ? DECISION_LABEL[r.hrDecision] ?? r.hrDecision : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-900 font-medium">
                    {r.salaryBumpAmount ? r.salaryBumpAmount.toLocaleString('en-PK') : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">
                    {r.outcomeDate ? formatDate(r.outcomeDate) : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${STATUS_TONE[r.status] ?? 'bg-slate-100 text-slate-600'}`}>
                      {r.status.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-2 font-semibold uppercase tracking-wide text-[10px] whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

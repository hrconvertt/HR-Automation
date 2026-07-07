/**
 * /dashboard/attendance/calendar — Team absence calendar (F2).
 *
 * Month view of who is OUT (Leave / Half Day / WFH / Leave of Absence) each
 * day, rows grouped by department. No salary data — presence only.
 *
 * Scope (server-enforced):
 *   HR_ADMIN / EXECUTIVE — all employees
 *   MANAGER / LEAD       — own team (self + direct reports)
 *   everyone else        — own department
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { dayKey } from '@/lib/date-utils'
import { parseMonth } from '@/lib/queries/attendance-grid'
import { getInitials } from '@/lib/utils'
import { CalendarMonthSelect } from './_month-select'

interface PageProps {
  searchParams: Promise<{ month?: string }>
}

type OutKind = 'L' | 'H' | 'WFH' | 'LOA'

const KIND_LABEL: Record<OutKind, string> = {
  L: 'Leave',
  H: 'Half Day',
  WFH: 'WFH',
  LOA: 'Leave of Absence',
}

// Monochrome chip styles, consistent with the StatusBadge system.
const KIND_CHIP: Record<OutKind, string> = {
  L: 'bg-slate-900 text-white',
  H: 'bg-white text-slate-900 border border-slate-900',
  WFH: 'bg-white text-slate-600 border border-slate-400 border-dashed',
  LOA: 'bg-slate-500 text-white',
}

function defaultMonth(): string {
  // Current month — always within the computed reporting window (Nov 2025 → now).
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default async function TeamAbsenceCalendarPage({ searchParams }: PageProps) {
  const { month: monthParam } = await searchParams
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true, departmentId: true } } },
  })
  if (!user) redirect('/login')

  const previewRole =
    user.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user.role
  const myEmpId = user.employee?.id ?? null

  // Role scope — presence data only, no compensation involved.
  const empFilter: Record<string, unknown> = (() => {
    if (effectiveRole === 'HR_ADMIN' || effectiveRole === 'EXECUTIVE') return {}
    if ((effectiveRole === 'MANAGER' || effectiveRole === 'LEAD') && myEmpId) {
      return { OR: [{ id: myEmpId }, { reportingManagerId: myEmpId }] }
    }
    if (user.employee?.departmentId) return { departmentId: user.employee.departmentId }
    if (myEmpId) return { id: myEmpId }
    return { id: '__none__' }
  })()

  const monthKey = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : defaultMonth()
  const { year, month } = parseMonth(monthKey)
  const mStart = new Date(year, month - 1, 1)
  const mEnd = new Date(year, month, 0, 23, 59, 59)
  const daysInMonth = new Date(year, month, 0).getDate()

  const employees = await prisma.employee.findMany({
    where: { status: 'ACTIVE', ...empFilter },
    select: { id: true, fullName: true, department: { select: { name: true } } },
    orderBy: { fullName: 'asc' },
  })
  const empIds = employees.map((e) => e.id)
  const empById = new Map(employees.map((e) => [e.id, e]))

  const [leaves, logs, loas] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: {
        employeeId: { in: empIds },
        status: 'APPROVED',
        fromDate: { lte: mEnd },
        toDate: { gte: mStart },
      },
      select: { employeeId: true, fromDate: true, toDate: true, firstDayHalf: true, lastDayHalf: true },
    }),
    prisma.attendanceLog.findMany({
      where: {
        employeeId: { in: empIds },
        date: { gte: mStart, lte: mEnd },
        OR: [{ status: { in: ['LEAVE', 'HALF_DAY'] } }, { workType: 'WFH' }],
      },
      select: { employeeId: true, date: true, status: true, workType: true },
    }),
    prisma.leaveOfAbsence.findMany({
      where: {
        employeeId: { in: empIds },
        status: { in: ['ACTIVE', 'EXTENDED'] },
        startDate: { lte: mEnd },
      },
      select: { employeeId: true, startDate: true, expectedReturn: true, actualReturn: true },
    }),
  ])

  // empId|day → strongest "out" kind (LOA > L > H > WFH)
  const RANK: Record<OutKind, number> = { LOA: 4, L: 3, H: 2, WFH: 1 }
  const outMap = new Map<string, OutKind>()
  const mark = (employeeId: string, day: number, kind: OutKind) => {
    const key = `${employeeId}|${day}`
    const cur = outMap.get(key)
    if (!cur || RANK[kind] > RANK[cur]) outMap.set(key, kind)
  }
  const dayOf = (d: Date) => (dayKey(d).slice(0, 7) === monthKey ? Number(dayKey(d).slice(8, 10)) : null)

  for (const l of logs) {
    const day = dayOf(l.date)
    if (day == null) continue
    if (l.status === 'LEAVE') mark(l.employeeId, day, 'L')
    else if (l.status === 'HALF_DAY') mark(l.employeeId, day, 'H')
    else if (l.workType === 'WFH' && (l.status === 'PRESENT' || l.status === 'LATE')) mark(l.employeeId, day, 'WFH')
  }
  for (const lv of leaves) {
    const cur = new Date(lv.fromDate)
    cur.setHours(0, 0, 0, 0)
    const end = new Date(lv.toDate)
    end.setHours(0, 0, 0, 0)
    while (cur <= end) {
      const day = dayOf(cur)
      if (day != null) {
        const isFirst = dayKey(cur) === dayKey(lv.fromDate)
        const isLast = dayKey(cur) === dayKey(lv.toDate)
        const half = (isFirst && lv.firstDayHalf) || (isLast && lv.lastDayHalf)
        mark(lv.employeeId, day, half ? 'H' : 'L')
      }
      cur.setDate(cur.getDate() + 1)
    }
  }
  for (const loa of loas) {
    const from = new Date(Math.max(loa.startDate.getTime(), mStart.getTime()))
    const returnDate = loa.actualReturn ?? loa.expectedReturn
    const to = new Date(Math.min(returnDate.getTime(), mEnd.getTime()))
    const cur = new Date(from)
    cur.setHours(0, 0, 0, 0)
    while (cur <= to) {
      const day = dayOf(cur)
      if (day != null) mark(loa.employeeId, day, 'LOA')
      cur.setDate(cur.getDate() + 1)
    }
  }

  // Group by department: dept → day → chips
  const byDept = new Map<string, Map<number, { name: string; kind: OutKind }[]>>()
  for (const [key, kind] of outMap) {
    const [empId, dayStr] = key.split('|')
    const emp = empById.get(empId)
    if (!emp) continue
    const dept = emp.department?.name ?? '—'
    if (!byDept.has(dept)) byDept.set(dept, new Map())
    const dayMap = byDept.get(dept)!
    const day = Number(dayStr)
    if (!dayMap.has(day)) dayMap.set(day, [])
    dayMap.get(day)!.push({ name: emp.fullName, kind })
  }
  const deptNames = [...byDept.keys()].sort()

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const dt = new Date(year, month - 1, i + 1)
    const dow = dt.getDay()
    return {
      day: i + 1,
      dowLabel: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][dow],
      isWeekend: dow === 0 || dow === 6,
    }
  })
  const monthLabel = new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            href="/dashboard/attendance"
            className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 mb-1"
          >
            <ArrowLeft className="w-4 h-4" /> Back to grid
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">Team Absence Calendar</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Who is out each day in {monthLabel} — grouped by department. Hover a chip for the full name.
          </p>
        </div>
        <CalendarMonthSelect month={monthKey} />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2">
        {(Object.keys(KIND_LABEL) as OutKind[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={`inline-flex items-center justify-center w-6 h-5 rounded text-[9px] font-bold ${KIND_CHIP[k]}`}>
              {k}
            </span>
            {KIND_LABEL[k]}
          </span>
        ))}
      </div>

      {deptNames.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg px-4 py-10 text-center text-sm text-slate-500">
          Nobody in your view is out in {monthLabel}.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse">
              <thead className="bg-slate-50">
                <tr>
                  <th className="sticky left-0 z-20 bg-slate-50 border-b border-r border-slate-200 px-3 py-2 text-left font-semibold text-slate-700 min-w-[160px]">
                    Department
                  </th>
                  {days.map((d) => (
                    <th
                      key={d.day}
                      className={`border-b border-slate-200 px-1 py-1 text-center font-medium text-slate-600 min-w-[34px] ${
                        d.isWeekend ? 'bg-slate-100/70 text-slate-400' : ''
                      }`}
                    >
                      <div className="leading-tight">
                        <div className="text-[10px] uppercase">{d.dowLabel}</div>
                        <div className="text-[11px] font-semibold">{d.day}</div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deptNames.map((dept) => {
                  const dayMap = byDept.get(dept)!
                  return (
                    <tr key={dept} className="hover:bg-slate-50/40 transition group">
                      <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-b border-r border-slate-200 px-3 py-2 font-medium text-slate-900 align-top shadow-[1px_0_0_0_rgb(226_232_240)]">
                        {dept}
                      </td>
                      {days.map((d) => {
                        const chips = dayMap.get(d.day) ?? []
                        return (
                          <td
                            key={d.day}
                            className={`border-b border-slate-100 p-0.5 align-top ${d.isWeekend ? 'bg-slate-50/40' : ''}`}
                          >
                            <div className="flex flex-col items-center gap-0.5">
                              {chips.slice(0, 3).map((c, i) => (
                                <span
                                  key={i}
                                  title={`${c.name} — ${KIND_LABEL[c.kind]}`}
                                  className={`inline-flex items-center justify-center w-7 h-5 rounded text-[9px] font-bold cursor-default ${KIND_CHIP[c.kind]}`}
                                >
                                  {getInitials(c.name)}
                                </span>
                              ))}
                              {chips.length > 3 && (
                                <span
                                  title={chips.slice(3).map((c) => `${c.name} — ${KIND_LABEL[c.kind]}`).join('\n')}
                                  className="text-[9px] text-slate-500 font-semibold cursor-default"
                                >
                                  +{chips.length - 3}
                                </span>
                              )}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

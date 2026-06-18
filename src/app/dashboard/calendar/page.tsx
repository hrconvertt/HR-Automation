import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PK_HOLIDAYS_2026 } from '@/lib/pk-holidays'
import { CalendarGrid } from './calendar-grid'

interface SearchParams { year?: string; month?: string }

export default async function CalendarPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const sp = (await searchParams) ?? {}
  const c = await cookies()
  const tok = c.get('hr_token')?.value
  const payload = tok ? await verifyToken(tok) : null
  if (!payload) redirect('/login')

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      role: true,
      employee: {
        select: { id: true, departmentId: true, reportingManagerId: true },
      },
    },
  })
  if (!me) redirect('/login')
  const previewRole = me.role === 'HR_ADMIN' ? c.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? me.role
  const isHR = effectiveRole === 'HR_ADMIN'
  const isExec = effectiveRole === 'EXECUTIVE'
  const isManager = effectiveRole === 'MANAGER'
  const isLead = effectiveRole === 'LEAD'

  // Calendar visibility:
  //   HR / Executive  â€” see everyone's birthdays + anniversaries
  //   Manager / Lead  â€” see own department only (their team feels like home)
  //   Employee        â€” see own department only
  // Probation milestones stay HR-only (already enforced below).
  // Holidays + company events are company-wide for everyone.
  const seesAllPeople = isHR || isExec
  const scopedDeptId = seesAllPeople ? null : me.employee?.departmentId ?? null

  const today = new Date()
  const year = sp.year ? Number(sp.year) : today.getFullYear()
  const month = sp.month ? Number(sp.month) : today.getMonth()

  // Range for queries: first â†’ last of viewed month
  const monthStart = new Date(year, month, 1)
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59)

  const [employees, companyEvents, probationRecords, leaveRequests, holidaysDb] = await Promise.all([
    prisma.employee.findMany({
      where: {
        status: 'ACTIVE',
        ...(scopedDeptId ? { departmentId: scopedDeptId } : {}),
      },
      select: { id: true, fullName: true, dob: true, joiningDate: true, reportingManagerId: true },
    }),
    prisma.companyEvent.findMany({
      where: { eventDate: { gte: monthStart, lte: monthEnd } },
      select: { id: true, title: true, eventDate: true, category: true, location: true },
    }),
    isHR
      ? prisma.probationRecord.findMany({
          where: { endDate: { gte: monthStart, lte: monthEnd }, status: { in: ['ACTIVE', 'UNDER_REVIEW'] } },
          select: { id: true, endDate: true, employee: { select: { fullName: true } } },
        })
      : Promise.resolve([]),
    // Approved leaves; manager sees own team, HR sees all, employee sees own
    prisma.leaveRequest.findMany({
      where: {
        status: 'APPROVED',
        OR: [{ fromDate: { lte: monthEnd } }],
        toDate: { gte: monthStart },
      },
      select: {
        id: true, fromDate: true, toDate: true, leaveType: true,
        employee: { select: { id: true, fullName: true, reportingManagerId: true } },
      },
    }),
    prisma.holiday.findMany({
      where: { date: { gte: monthStart, lte: monthEnd } },
      select: { id: true, name: true, date: true, type: true },
    }),
  ])

  // Scope leaves:
  //   HR / Executive  â€” see everyone's approved leaves
  //   Manager / Lead  â€” see team's leaves + their own
  //   Employee        â€” see own only
  // Bug fix: the previous filter omitted the manager's own leave (they only
  //   matched direct reports) and excluded EXECUTIVE/LEAD entirely. Aqib's
  //   own approved leave wasn't surfacing because he viewed his own calendar
  //   under a non-HR role and the filter only checked id-equality.
  const myEmpId = me.employee?.id ?? null
  const visibleLeaves = leaveRequests.filter((l) => {
    if (isHR || isExec) return true
    if (isManager || isLead) {
      return l.employee.reportingManagerId === myEmpId || l.employee.id === myEmpId
    }
    return l.employee.id === myEmpId
  })

  return (
    <CalendarGrid
      year={year}
      month={month}
      isHR={isHR}
      employees={employees.map((e) => ({
        id: e.id,
        fullName: e.fullName,
        dob: e.dob ? e.dob.toISOString() : null,
        joiningDate: e.joiningDate.toISOString(),
      }))}
      companyEvents={companyEvents.map((e) => ({
        ...e,
        eventDate: e.eventDate.toISOString(),
      }))}
      probationEnds={probationRecords.map((p) => ({
        id: p.id,
        endDate: p.endDate.toISOString(),
        employeeName: p.employee.fullName,
      }))}
      leaves={visibleLeaves.map((l) => ({
        id: l.id,
        fromDate: l.fromDate.toISOString(),
        toDate: l.toDate.toISOString(),
        leaveType: l.leaveType,
        employeeName: l.employee.fullName,
      }))}
      dbHolidays={holidaysDb.map((h) => ({ id: h.id, name: h.name, date: h.date.toISOString(), type: h.type }))}
      pkHolidays={PK_HOLIDAYS_2026.filter((h) => {
        const d = new Date(h.date)
        return d.getFullYear() === year && d.getMonth() === month
      })}
    />
  )
}

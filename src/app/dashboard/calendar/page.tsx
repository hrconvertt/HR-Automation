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
  const payload = await verifyToken(tok)
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

  const [employees, companyEvents, probationRecords, probationMeetings, leaveRequests, holidaysDb, wfhLogs, loaRecords] = await Promise.all([
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
    // Probation review meetings HR has scheduled. Kept on the calendar so the
    // date does not live only on the probation record, where it is missed.
    isHR
      ? prisma.probationRecord.findMany({
          where: { meetingScheduledFor: { gte: monthStart, lte: monthEnd }, outcomeEnactedAt: null },
          select: { id: true, meetingScheduledFor: true, employee: { select: { fullName: true } } },
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
    // WFH days and leaves of absence, so the one calendar shows everything the
    // old Team Absence Calendar did — leave, WFH and LOA in a single view.
    prisma.attendanceLog.findMany({
      where: { date: { gte: monthStart, lte: monthEnd }, workType: 'WFH' },
      select: {
        id: true, date: true,
        employee: { select: { id: true, fullName: true, reportingManagerId: true } },
      },
    }),
    prisma.leaveOfAbsence.findMany({
      where: {
        status: { in: ['ACTIVE', 'EXTENDED'] },
        startDate: { lte: monthEnd },
        expectedReturn: { gte: monthStart },
      },
      select: {
        id: true, startDate: true, expectedReturn: true,
        employee: { select: { id: true, fullName: true, reportingManagerId: true } },
      },
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
  // Same visibility rule for every absence kind: HR/Exec see all, a manager/lead
  // sees their team plus themselves, everyone else sees only their own.
  const canSee = (emp: { id: string; reportingManagerId: string | null }) => {
    if (isHR || isExec) return true
    if (isManager || isLead) return emp.reportingManagerId === myEmpId || emp.id === myEmpId
    return emp.id === myEmpId
  }
  const visibleLeaves = leaveRequests.filter((l) => canSee(l.employee))

  // WFH and LOA join the leaves layer as their own types, so the single
  // calendar shows leave, WFH and LOA together — what the Team Absence Calendar
  // used to show on its own.
  const wfhLeaves = wfhLogs.filter((w) => canSee(w.employee)).map((w) => ({
    id: `wfh-${w.id}`,
    fromDate: w.date.toISOString(),
    toDate: w.date.toISOString(),
    leaveType: 'WFH',
    employeeName: w.employee.fullName,
  }))
  const loaLeaves = loaRecords.filter((r) => canSee(r.employee)).map((r) => ({
    id: `loa-${r.id}`,
    fromDate: r.startDate.toISOString(),
    toDate: r.expectedReturn.toISOString(),
    leaveType: 'LOA',
    employeeName: r.employee.fullName,
  }))

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
      probationMeetings={probationMeetings
        .filter((p) => p.meetingScheduledFor)
        .map((p) => ({
          id: p.id,
          meetingDate: p.meetingScheduledFor!.toISOString(),
          employeeName: p.employee.fullName,
        }))}
      leaves={[
        ...visibleLeaves.map((l) => ({
          id: l.id,
          fromDate: l.fromDate.toISOString(),
          toDate: l.toDate.toISOString(),
          leaveType: l.leaveType,
          employeeName: l.employee.fullName,
        })),
        ...wfhLeaves,
        ...loaLeaves,
      ]}
      dbHolidays={holidaysDb.map((h) => ({ id: h.id, name: h.name, date: h.date.toISOString(), type: h.type }))}
      pkHolidays={PK_HOLIDAYS_2026.filter((h) => {
        const d = new Date(h.date)
        return d.getFullYear() === year && d.getMonth() === month
      })}
    />
  )
}

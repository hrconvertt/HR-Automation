/**
 * GET /api/leave/planner?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Everything the request-leave calendar needs to draw a month, in one call:
 * the public holidays, the days this employee has already booked, and how many
 * of their department are already away on each day.
 *
 * That last part is Workday's "View Teams" and "Absence Thresholds" — the
 * question you actually want answered before picking a date is "is anyone left
 * to cover it", and this app had no way to ask it. The main Calendar already
 * shows colleagues' leave, so this exposes nothing new; it just puts it where
 * the decision is made.
 *
 * Scoped to the signed-in employee. HR may look at somebody else's planner via
 * ?employeeId=, which is the same rule the balances endpoint uses.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export async function GET(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true, departmentId: true } } },
  })
  if (!me?.employee) return NextResponse.json({ error: 'No employee linked to this account' }, { status: 400 })

  const { searchParams } = new URL(request.url)
  const asked = searchParams.get('employeeId')
  let employeeId = me.employee.id
  let departmentId = me.employee.departmentId
  if (asked && asked !== me.employee.id) {
    if (me.role !== 'HR_ADMIN') {
      return NextResponse.json({ error: 'You can only plan your own leave.' }, { status: 403 })
    }
    const target = await prisma.employee.findUnique({
      where: { id: asked }, select: { id: true, departmentId: true },
    })
    if (!target) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    employeeId = target.id
    departmentId = target.departmentId
  }

  const fromStr = searchParams.get('from')
  const toStr = searchParams.get('to')
  if (!fromStr || !toStr) {
    return NextResponse.json({ error: 'from and to are required' }, { status: 400 })
  }
  const from = parseLocalDate(fromStr)
  const to = parseLocalDate(toStr)
  to.setHours(23, 59, 59, 999)
  if (to < from) return NextResponse.json({ error: 'to must not be before from' }, { status: 400 })

  const [holidays, mine, colleagues] = await Promise.all([
    prisma.holiday.findMany({
      where: { date: { gte: from, lte: to } },
      select: { date: true, name: true, type: true },
      orderBy: { date: 'asc' },
    }),
    prisma.leaveRequest.findMany({
      where: {
        employeeId,
        status: { in: ['PENDING', 'PENDING_HR', 'APPROVED'] },
        fromDate: { lte: to }, toDate: { gte: from },
      },
      select: { fromDate: true, toDate: true, status: true, category: true, leaveType: true },
    }),
    departmentId
      ? prisma.leaveRequest.findMany({
        where: {
          employeeId: { not: employeeId },
          employee: { departmentId, status: 'ACTIVE' },
          status: { in: ['PENDING', 'PENDING_HR', 'APPROVED'] },
          fromDate: { lte: to }, toDate: { gte: from },
        },
        select: {
          fromDate: true, toDate: true, category: true, status: true,
          employee: { select: { fullName: true } },
        },
      })
      : [],
  ])

  // Expand each request across the days it covers, so the calendar can read a
  // day at a time rather than working out overlaps itself.
  const expand = <T>(rows: { fromDate: Date; toDate: Date }[], make: (r: number) => T) => {
    const out = new Map<string, T[]>()
    rows.forEach((r, i) => {
      const cur = new Date(r.fromDate)
      const end = new Date(r.toDate)
      while (cur <= end) {
        if (cur >= from && cur <= to) {
          const k = dayKey(cur)
          if (!out.has(k)) out.set(k, [])
          out.get(k)!.push(make(i))
        }
        cur.setDate(cur.getDate() + 1)
      }
    })
    return out
  }

  const mineByDay = expand(mine, (i) => ({
    status: mine[i].status, category: mine[i].category, leaveType: mine[i].leaveType,
  }))
  const teamByDay = expand(colleagues, (i) => ({
    name: colleagues[i].employee.fullName,
    category: colleagues[i].category,
    pending: colleagues[i].status !== 'APPROVED',
  }))

  const headcount = departmentId
    ? await prisma.employee.count({ where: { departmentId, status: 'ACTIVE' } })
    : 0

  return NextResponse.json({
    from: fromStr,
    to: toStr,
    headcount,
    holidays: holidays.map((h) => ({ date: dayKey(h.date), name: h.name, type: h.type })),
    mine: Object.fromEntries(mineByDay),
    team: Object.fromEntries(teamByDay),
  })
}

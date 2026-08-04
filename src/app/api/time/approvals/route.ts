/**
 * GET /api/time/approvals
 *
 * Overtime awaiting a decision. Nothing else.
 *
 * This inbox used to carry leave as well, which put the same request in two
 * places — here and in the Leave module — with no way to tell which one was
 * authoritative. Leave belongs to Leave; Time Tracking approves time.
 *
 *   MANAGER  → OT pending for their direct reports
 *   HR_ADMIN → all OT pending
 *
 * "Pending" means no decision has been recorded. A rejected row is decided and
 * never reappears here.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { DEFAULT_OT_RATE_PCT, overtimeAmount } from '@/lib/overtime'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN' && payload.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  const myEmpId = user?.employee?.id ?? null
  const isHR = payload.role === 'HR_ADMIN'

  const logs = await prisma.attendanceLog.findMany({
    where: {
      overtimeHours: { gt: 0 },
      // Undecided only. `overtimeStatus: null` covers rows written before the
      // field existed; REJECTED and APPROVED are both decisions and drop out.
      OR: [{ overtimeStatus: null }, { overtimeStatus: 'PENDING' }],
      ...(isHR ? {} : { employee: { reportingManagerId: myEmpId } }),
    },
    include: {
      employee: {
        select: {
          id: true, fullName: true,
          department: { select: { name: true } },
          salary: {
            select: {
              basic: true, houseRent: true, utilities: true, food: true,
              fuel: true, medicalAllowance: true, otherAllowance: true,
            },
          },
        },
      },
    },
    orderBy: { date: 'desc' },
    take: 200,
  })

  const ot = logs
    // A manager cannot sign off their own overtime — that goes to HR.
    .filter((l) => isHR || l.employeeId !== myEmpId)
    .map((l) => {
      const s = l.employee.salary
      const gross = s
        ? s.basic + s.houseRent + s.utilities + s.food + s.fuel + s.medicalAllowance + s.otherAllowance
        : 0
      const ratePct = l.overtimeRatePct ?? DEFAULT_OT_RATE_PCT
      return {
        kind: 'OT' as const,
        id: l.id,
        employeeId: l.employeeId,
        fullName: l.employee.fullName,
        department: l.employee.department?.name ?? '—',
        date: l.date.toISOString(),
        overtimeHours: l.overtimeHours,
        hoursWorked: l.hoursWorked,
        ratePct,
        amount: gross > 0 ? overtimeAmount(gross, l.overtimeHours, ratePct) : null,
        note: l.overtimeNote,
      }
    })

  return NextResponse.json({ counts: { ot: ot.length }, ot })
}

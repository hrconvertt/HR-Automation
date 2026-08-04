/**
 * GET /api/time/overtime?status=APPROVED|PENDING|REJECTED|ALL
 *
 * The overtime record — every hour claimed, the rate applied to it, what it is
 * worth, who decided and when. The approvals inbox only ever showed what was
 * still undecided, so once a decision was made the hours vanished with nowhere
 * to look them up.
 *
 * Amounts are derived, not stored: Convertt records a monthly salary and no
 * hourly rate, so the hourly figure comes from the standard month in
 * @/lib/overtime. Changing that constant re-prices the whole history, which is
 * the correct behaviour — nothing here is a posted payment.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { DEFAULT_OT_RATE_PCT, overtimeAmount, hourlyRate } from '@/lib/overtime'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  const myEmpId = user?.employee?.id ?? null

  const previewRole =
    user?.role === 'HR_ADMIN' ? request.cookies.get('hr_preview_role')?.value : undefined
  const role = previewRole ?? payload.role

  const { searchParams } = new URL(request.url)
  const status = (searchParams.get('status') ?? 'ALL').toUpperCase()

  // Scope: HR and executives see everyone, managers see their reports plus
  // themselves, everyone else sees only their own hours.
  let scope: Record<string, unknown> = {}
  if (role === 'HR_ADMIN' || role === 'EXECUTIVE') {
    scope = {}
  } else if (role === 'MANAGER' || role === 'LEAD') {
    scope = {
      OR: [{ employeeId: myEmpId }, { employee: { reportingManagerId: myEmpId } }],
    }
  } else {
    scope = { employeeId: myEmpId ?? '__none__' }
  }

  const statusWhere =
    status === 'PENDING' ? { OR: [{ overtimeStatus: null }, { overtimeStatus: 'PENDING' }] }
    : status === 'ALL' ? {}
    : { overtimeStatus: status }

  const logs = await prisma.attendanceLog.findMany({
    where: { overtimeHours: { gt: 0 }, ...scope, ...statusWhere },
    include: {
      employee: {
        select: {
          id: true, fullName: true, employeeCode: true, designation: true,
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
    take: 500,
  })

  // Who signed each one off. The ids are Users; the name people recognise is
  // on the Employee behind them.
  const deciderIds = [...new Set(logs.map((l) => l.overtimeApprovedById).filter(Boolean))] as string[]
  const deciders = deciderIds.length
    ? await prisma.user.findMany({
        where: { id: { in: deciderIds } },
        select: { id: true, employee: { select: { fullName: true } }, email: true },
      })
    : []
  const deciderName = new Map(
    deciders.map((d) => [d.id, d.employee?.fullName ?? d.email ?? '—']),
  )

  const rows = logs.map((l) => {
    const s = l.employee.salary
    const gross = s
      ? s.basic + s.houseRent + s.utilities + s.food + s.fuel + s.medicalAllowance + s.otherAllowance
      : 0
    const ratePct = l.overtimeRatePct ?? DEFAULT_OT_RATE_PCT
    return {
      id: l.id,
      date: l.date.toISOString(),
      employee: {
        fullName: l.employee.fullName,
        employeeCode: l.employee.employeeCode,
        designation: l.employee.designation,
        department: l.employee.department?.name ?? '—',
      },
      hoursWorked: l.hoursWorked,
      overtimeHours: l.overtimeHours,
      ratePct,
      hourlyRate: gross > 0 ? Math.round(hourlyRate(gross)) : null,
      amount: gross > 0 ? overtimeAmount(gross, l.overtimeHours, ratePct) : null,
      status: l.overtimeStatus ?? 'PENDING',
      decidedAt: l.overtimeDecidedAt?.toISOString() ?? null,
      decidedBy: l.overtimeApprovedById ? deciderName.get(l.overtimeApprovedById) ?? '—' : null,
      note: l.overtimeNote,
    }
  })

  const totals = {
    hours: rows.reduce((n, r) => n + r.overtimeHours, 0),
    approvedHours: rows.filter((r) => r.status === 'APPROVED').reduce((n, r) => n + r.overtimeHours, 0),
    approvedAmount: rows
      .filter((r) => r.status === 'APPROVED')
      .reduce((n, r) => n + (r.amount ?? 0), 0),
    pending: rows.filter((r) => r.status === 'PENDING').length,
  }

  return NextResponse.json({ rows, totals, canDecide: role === 'HR_ADMIN' || role === 'MANAGER' })
}

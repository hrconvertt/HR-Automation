/**
 * GET /api/time/approvals
 *
 * Unified inbox of everything waiting on the caller's decision.
 *
 *   MANAGER  â†’ OT pending for direct reports + Leave at PENDING (manager stage)
 *   HR_ADMIN â†’ All OT pending + all Leave at PENDING_HR (final stage) + any
 *              PENDING leave that has no manager attached (HR fast-path)
 *
 * Each item carries enough context to render and to dispatch the correct
 * approve / reject call from the UI. Action endpoints are unchanged.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

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

  // â”€â”€ Build employee scope â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const empScope: Record<string, unknown> = isHR ? {} : { reportingManagerId: myEmpId }

  // â”€â”€ Overtime â€” pending approval â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //   Currently HR-only. Managers don't approve OT in this build (feature kept
  //   in code for future re-enable: just remove the `isHR ?` gate below).
  const otLogs = isHR ? await prisma.attendanceLog.findMany({
    where: {
      overtimeHours: { gt: 0 },
      overtimeApproved: false,
    },
    include: {
      employee: { select: { id: true, fullName: true, department: { select: { name: true } } } },
    },
    orderBy: { date: 'desc' },
    take: 200,
  }) : []
  const otItems = otLogs
    .filter((l) => isHR || l.employeeId !== myEmpId)
    .map((l) => ({
      kind: 'OT' as const,
      id: l.id,
      employeeId: l.employeeId,
      fullName: l.employee.fullName,
      department: l.employee.department?.name ?? 'â€”',
      date: l.date.toISOString(),
      overtimeHours: l.overtimeHours,
      hoursWorked: l.hoursWorked,
    }))

  // â”€â”€ Leave â€” by stage and role â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // For MANAGER: PENDING (their stage) only; their own requests excluded
  // For HR_ADMIN: PENDING_HR (their stage) + any PENDING for employees without a manager
  let leaveItems: Array<{
    kind: 'LEAVE'
    id: string
    employeeId: string
    fullName: string
    department: string
    leaveType: string
    fromDate: string
    toDate: string
    days: number
    reason: string
    stage: 'PENDING' | 'PENDING_HR'
    requesterBalance: { remaining: number; allocated: number; used: number } | null
  }> = []
  {
    let leaves
    if (isHR) {
      leaves = await prisma.leaveRequest.findMany({
        where: { status: { in: ['PENDING', 'PENDING_HR'] } },
        include: {
          employee: {
            select: {
              id: true, fullName: true, reportingManagerId: true,
              department: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
    } else {
      leaves = await prisma.leaveRequest.findMany({
        where: {
          status: 'PENDING',
          employee: empScope,
          NOT: { employeeId: myEmpId ?? undefined },
        },
        include: {
          employee: {
            select: {
              id: true, fullName: true, reportingManagerId: true,
              department: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
    }

    // Pull balances in bulk for the leave types involved
    const balances = await prisma.leaveBalance.findMany({
      where: {
        year: new Date().getFullYear(),
        OR: leaves.map((l) => ({ employeeId: l.employeeId, leaveType: l.leaveType })),
      },
    })
    const balLookup = new Map(
      balances.map((b) => [`${b.employeeId}::${b.leaveType}`, b]),
    )

    leaveItems = leaves.map((l) => {
      const b = balLookup.get(`${l.employeeId}::${l.leaveType}`)
      return {
        kind: 'LEAVE' as const,
        id: l.id,
        employeeId: l.employeeId,
        fullName: l.employee.fullName,
        department: l.employee.department?.name ?? 'â€”',
        leaveType: l.leaveType,
        fromDate: l.fromDate.toISOString(),
        toDate: l.toDate.toISOString(),
        days: l.days,
        reason: l.reason,
        stage: l.status as 'PENDING' | 'PENDING_HR',
        requesterBalance: b
          ? { remaining: b.remaining, allocated: b.allocated, used: b.used }
          : null,
      }
    })
  }

  return NextResponse.json({
    counts: { ot: otItems.length, leave: leaveItems.length },
    ot: otItems,
    leave: leaveItems,
  })
}

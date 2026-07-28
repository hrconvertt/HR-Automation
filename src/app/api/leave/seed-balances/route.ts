/**
 * POST /api/leave/seed-balances?employeeId=<id>
 *
 * HR_ADMIN-only. Seeds (or refreshes) LeaveBalance rows for the current year
 * for the given employee using Convertt's leave policy:
 *
 *   PERMANENT : CASUAL 14 / SICK 10 (+ MATERNITY 90 | PATERNITY 10 by gender)
 *   PROBATION : CASUAL 4  / SICK 2
 *   INTERNSHIP / TRAINING: CASUAL 1
 *
 * Allocations pro-rated by joining date. `used` is computed from APPROVED
 * LeaveRequests for the same year. Same logic as scripts/seed-leave-balances.cjs.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

type Allocation = Record<string, number>

const POLICY: Record<string, Allocation> = {
  PERMANENT:  { CASUAL: 14, SICK: 10 },
  PROBATION:  { CASUAL: 4,  SICK: 2 },
  INTERNSHIP: { CASUAL: 1 },
  TRAINING:   { CASUAL: 1 },
}

function prorate(fullYear: number, joiningDate: Date | null, year: number): number {
  if (!joiningDate) return fullYear
  const join = new Date(joiningDate)
  const yearStart = new Date(Date.UTC(year, 0, 1))
  const yearEnd = new Date(Date.UTC(year, 11, 31))
  if (join.getTime() <= yearStart.getTime()) return fullYear
  if (join.getTime() > yearEnd.getTime()) return 0
  const monthsRemaining = 12 - join.getUTCMonth()
  const value = (fullYear * monthsRemaining) / 12
  return Math.round(value * 2) / 2
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Forbidden â€” HR only' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const employeeId = searchParams.get('employeeId')
  if (!employeeId) {
    return NextResponse.json({ error: 'employeeId query param required' }, { status: 400 })
  }

  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true, fullName: true, employeeType: true, gender: true, joiningDate: true,
    },
  })
  if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const year = new Date().getFullYear()
  const empType = emp.employeeType || 'PROBATION'
  const base = POLICY[empType] || POLICY.PROBATION
  const allocations: Allocation = { ...base }

  if (empType === 'PERMANENT') {
    const g = String(emp.gender || '').toUpperCase()
    if (g.startsWith('F')) allocations.MATERNITY = 90
    else if (g.startsWith('M')) allocations.PATERNITY = 10
  }

  const yearStart = new Date(Date.UTC(year, 0, 1))
  const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59))
  const approved = await prisma.leaveRequest.findMany({
    where: {
      employeeId: emp.id,
      status: 'APPROVED',
      fromDate: { lte: yearEnd },
      toDate: { gte: yearStart },
    },
    select: { leaveType: true, days: true },
  })
  const usedByType: Record<string, number> = {}
  for (const r of approved) {
    const k = String(r.leaveType || '').toUpperCase()
    usedByType[k] = (usedByType[k] || 0) + (r.days || 0)
  }

  const seeded: { leaveType: string; allocated: number; used: number; remaining: number }[] = []
  for (const [leaveType, fullYear] of Object.entries(allocations)) {
    const allocated = prorate(fullYear, emp.joiningDate, year)
    const used = usedByType[leaveType] || 0
    const remaining = Math.max(0, allocated - used)
    await prisma.leaveBalance.upsert({
      where: { employeeId_year_leaveType: { employeeId: emp.id, year, leaveType } },
      create: { employeeId: emp.id, year, leaveType, allocated, used, remaining, pending: 0 },
      update: { allocated, used, remaining },
    })
    seeded.push({ leaveType, allocated, used, remaining })
  }

  return NextResponse.json({
    ok: true,
    employeeId: emp.id,
    employeeName: emp.fullName,
    employeeType: empType,
    year,
    seeded,
  })
}

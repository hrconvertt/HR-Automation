/**
 * GET /api/sandwich — every sandwich deduction on record.
 *
 * Optional ?month= &year= to scope to one payroll month.
 *
 * HR and executives. A deduction is somebody's pay, so this is not a list
 * managers get to browse.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN' && payload.role !== 'EXECUTIVE') {
    return NextResponse.json({ error: 'HR only' }, { status: 403 })
  }

  const sp = request.nextUrl.searchParams
  const month = Number(sp.get('month'))
  const year = Number(sp.get('year'))
  const where = {
    ...(Number.isInteger(month) && month >= 1 && month <= 12 ? { month } : {}),
    ...(Number.isInteger(year) && year > 2000 ? { year } : {}),
  }

  const rows = await prisma.sandwichDeduction.findMany({
    where,
    orderBy: [{ triggerDate: 'desc' }],
    include: {
      employee: {
        select: { id: true, fullName: true, employeeCode: true, designation: true, email: true },
      },
      leaveRequest: { select: { id: true, leaveType: true, reason: true } },
    },
  })

  const applied = rows.filter((r) => r.status === 'APPLIED')
  return NextResponse.json({
    deductions: rows.map((r) => ({
      ...r,
      dates: (() => { try { return JSON.parse(r.dates) as string[] } catch { return [] } })(),
    })),
    totals: {
      count: rows.length,
      appliedCount: applied.length,
      appliedAmount: Math.round(applied.reduce((s, r) => s + r.amount, 0) * 100) / 100,
      appliedDays: applied.reduce((s, r) => s + r.days, 0),
    },
  })
}

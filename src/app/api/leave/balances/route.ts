import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Look up user â†’ employee via Prisma (token's employeeId can be stale)
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  const myEmpId = user?.employee?.id ?? null

  const { searchParams } = new URL(request.url)
  const wantAll = searchParams.get('all') === 'true'

  // â”€â”€ "All employees" mode â€” HR_ADMIN / EXECUTIVE only â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (wantAll) {
    if (payload.role !== 'HR_ADMIN' && payload.role !== 'EXECUTIVE') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const all = await prisma.leaveBalance.findMany({
      where: { year: new Date().getFullYear() },
      include: {
        employee: {
          select: {
            id: true, fullName: true, employeeCode: true,
            department: { select: { name: true } },
          },
        },
      },
      orderBy: [{ employee: { fullName: 'asc' } }, { leaveType: 'asc' }],
    })
    return NextResponse.json({
      grouped: groupByEmployee(all),
    })
  }

  const requestedEmpId = searchParams.get('employeeId')
  const empId = requestedEmpId ?? myEmpId

  if (!empId) return NextResponse.json({ balances: [] })

  // â”€â”€ Authorisation: who's balance can the caller see? â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // EMPLOYEE: only self
  // MANAGER:  self + direct reports
  // HR_ADMIN / EXECUTIVE: anyone
  if (empId !== myEmpId) {
    if (payload.role === 'EMPLOYEE') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (payload.role === 'MANAGER') {
      const target = await prisma.employee.findUnique({
        where: { id: empId },
        select: { reportingManagerId: true },
      })
      if (!target || target.reportingManagerId !== myEmpId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }
    // HR_ADMIN / EXECUTIVE: allowed.
  }

  const balances = await prisma.leaveBalance.findMany({
    where: { employeeId: empId, year: new Date().getFullYear() },
    orderBy: { leaveType: 'asc' },
  })

  // Map to shape the leave page expects
  const mapped = balances.map((b) => ({
    id: b.id,
    balance: b.remaining,
    used: b.used,
    leavePolicy: { leaveType: b.leaveType, daysPerYear: b.allocated },
  }))

  return NextResponse.json({ balances: mapped })
}

// â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type RawBalanceWithEmp = {
  id: string; leaveType: string; allocated: number; used: number; remaining: number;
  employee: {
    id: string; fullName: string; employeeCode: string;
    department: { name: string } | null;
  };
}

function groupByEmployee(rows: RawBalanceWithEmp[]) {
  const byEmp = new Map<string, {
    employeeId: string; fullName: string; employeeCode: string; department: string;
    balances: { leaveType: string; allocated: number; used: number; remaining: number }[];
    totalAllocated: number; totalUsed: number; totalRemaining: number;
  }>()
  for (const b of rows) {
    const key = b.employee.id
    const cur = byEmp.get(key) ?? {
      employeeId: b.employee.id,
      fullName: b.employee.fullName,
      employeeCode: b.employee.employeeCode,
      department: b.employee.department?.name ?? 'â€”',
      balances: [],
      totalAllocated: 0, totalUsed: 0, totalRemaining: 0,
    }
    cur.balances.push({
      leaveType: b.leaveType, allocated: b.allocated, used: b.used, remaining: b.remaining,
    })
    cur.totalAllocated += b.allocated
    cur.totalUsed += b.used
    cur.totalRemaining += b.remaining
    byEmp.set(key, cur)
  }
  return [...byEmp.values()]
}

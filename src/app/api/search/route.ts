import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface SearchResult {
  type: 'employee' | 'payslip' | 'policy' | 'leave' | 'letter'
  id: string
  title: string
  subtitle?: string
  href: string
}

export async function GET(request: NextRequest) {
  const c = await cookies()
  const tok = c.get('hr_token')?.value
  const payload = tok ? await verifyToken(tok) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()
  const limit = Math.min(Number(searchParams.get('limit') ?? 20), 50)
  if (q.length < 2) return NextResponse.json({ results: [] })

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true, fullName: true } } },
  })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = user.role
  const myEmployeeId = user.employee?.id ?? null
  const isHR = role === 'HR_ADMIN'
  const isExec = role === 'EXECUTIVE'
  const isManager = role === 'MANAGER' || role === 'LEAD'
  const seeAll = isHR || isExec

  const perBucket = Math.ceil(limit / 5)
  const results: SearchResult[] = []

  // Helper for case-insensitive contains
  type StrFilter = { contains: string; mode: 'insensitive' }
  const ic = (s: string): StrFilter => ({ contains: s, mode: 'insensitive' })

  // Employees
  try {
    const empWhere: Record<string, unknown> = { fullName: ic(q) }
    if (!seeAll) {
      if (isManager && myEmployeeId) {
        empWhere.OR = [{ reportingManagerId: myEmployeeId }, { id: myEmployeeId }]
      } else if (myEmployeeId) {
        empWhere.id = myEmployeeId
      } else {
        empWhere.id = '__none__'
      }
    }
    const employees = await prisma.employee.findMany({
      where: empWhere,
      select: { id: true, fullName: true, designation: true },
      take: perBucket,
    })
    for (const e of employees) {
      results.push({
        type: 'employee',
        id: e.id,
        title: e.fullName,
        subtitle: e.designation ?? undefined,
        href: `/dashboard/employees/${e.id}`,
      })
    }
  } catch {}

  // Payslips — search by reference
  try {
    const psWhere: Record<string, unknown> = { reference: ic(q) }
    if (!seeAll) {
      if (isManager && myEmployeeId) {
        psWhere.OR = [
          { employee: { reportingManagerId: myEmployeeId } },
          { employeeId: myEmployeeId },
        ]
      } else if (myEmployeeId) {
        psWhere.employeeId = myEmployeeId
      } else {
        psWhere.employeeId = '__none__'
      }
    }
    const payslips = await prisma.payslip.findMany({
      where: psWhere,
      select: {
        id: true,
        reference: true,
        month: true,
        year: true,
        employee: { select: { fullName: true } },
      },
      take: perBucket,
    })
    for (const p of payslips) {
      results.push({
        type: 'payslip',
        id: p.id,
        title: p.reference ?? `Payslip ${p.month}/${p.year}`,
        subtitle: p.employee.fullName,
        href: `/dashboard/payroll/payslip/${p.id}`,
      })
    }
  } catch {}

  // Policies
  try {
    const policies = await prisma.policyDocument.findMany({
      where: { title: ic(q), status: { not: 'ARCHIVED' } },
      select: { id: true, title: true, category: true },
      take: perBucket,
    })
    for (const p of policies) {
      results.push({
        type: 'policy',
        id: p.id,
        title: p.title,
        subtitle: p.category,
        href: `/dashboard/policies/${p.id}`,
      })
    }
  } catch {}

  // Leaves
  try {
    const leaveWhere: Record<string, unknown> = { reason: ic(q) }
    if (!seeAll) {
      if (isManager && myEmployeeId) {
        leaveWhere.OR = [
          { employee: { reportingManagerId: myEmployeeId } },
          { employeeId: myEmployeeId },
        ]
      } else if (myEmployeeId) {
        leaveWhere.employeeId = myEmployeeId
      } else {
        leaveWhere.employeeId = '__none__'
      }
    }
    const leaves = await prisma.leaveRequest.findMany({
      where: leaveWhere,
      select: {
        id: true,
        reason: true,
        leaveType: true,
        employee: { select: { fullName: true } },
      },
      take: perBucket,
    })
    for (const l of leaves) {
      results.push({
        type: 'leave',
        id: l.id,
        title: l.reason.length > 50 ? l.reason.slice(0, 50) + '…' : l.reason,
        subtitle: `${l.leaveType} · ${l.employee.fullName}`,
        href: '/dashboard/leave',
      })
    }
  } catch {}

  // Letters (LetterRequest, by purpose/letterType)
  try {
    const letterWhere: Record<string, unknown> = {
      OR: [{ purpose: ic(q) }, { letterType: ic(q) }, { letterNumber: ic(q) }],
    }
    if (!seeAll) {
      if (myEmployeeId) {
        letterWhere.employeeId = myEmployeeId
      } else {
        letterWhere.employeeId = '__none__'
      }
    }
    const letters = await prisma.letterRequest.findMany({
      where: letterWhere,
      select: {
        id: true,
        letterType: true,
        purpose: true,
        letterNumber: true,
        employee: { select: { fullName: true } },
      },
      take: perBucket,
    })
    for (const l of letters) {
      results.push({
        type: 'letter',
        id: l.id,
        title: l.letterNumber ?? l.letterType,
        subtitle: `${l.employee.fullName}${l.purpose ? ' · ' + l.purpose : ''}`,
        href: '/dashboard/letters',
      })
    }
  } catch {}

  return NextResponse.json({ results: results.slice(0, limit) })
}

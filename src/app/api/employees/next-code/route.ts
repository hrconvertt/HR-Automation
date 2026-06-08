/**
 * GET /api/employees/next-code?dept=<departmentId>
 *
 * Suggests the next CON-{DEPT}-{NNN} employee code for a department by
 * scanning existing CON-{DEPT}-NNN codes and picking max + 1, zero-padded
 * to three digits.
 *
 * HR_ADMIN only — used by the New Employee dialog.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const deptId = searchParams.get('dept') ?? ''
  const deptCodeRaw = searchParams.get('code') ?? ''

  let deptCode = deptCodeRaw.toUpperCase() || 'GEN'
  if (deptId) {
    const d = await prisma.department.findUnique({
      where: { id: deptId },
      select: { code: true },
    })
    if (d) deptCode = d.code
  }

  // Look at every existing employeeCode for this dept prefix.
  const prefix = `CON-${deptCode}-`
  const rows = await prisma.employee.findMany({
    where: { employeeCode: { startsWith: prefix } },
    select: { employeeCode: true },
  })

  let maxN = 0
  for (const r of rows) {
    const suffix = r.employeeCode.slice(prefix.length)
    const n = parseInt(suffix, 10)
    if (Number.isFinite(n) && n > maxN) maxN = n
  }

  const nextNum = maxN + 1
  const next = `${prefix}${String(nextNum).padStart(3, '0')}`
  return NextResponse.json({ next, deptCode, nextNum })
}

/**
 * GET /api/employees/next-code?dept=<departmentId>
 *
 * Suggests the next CON-{DEPT}-{NNN} employee code for a department by
 * scanning existing CON-{DEPT}-NNN codes and picking max + 1, zero-padded
 * to three digits.
 *
 * HR_ADMIN only â€” used by the New Employee dialog.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
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

  // The number is a company-wide joining sequence, not a per-department one.
  //
  // This used to take the maximum within the department prefix, which reads
  // naturally and is wrong: in the master sheet the number is the SR # — the
  // order people joined the company. Web-Shopify runs 004, 006, 010, 013 …
  // because other departments hired in between. Numbering per department would
  // have suggested CON-UIUX-044 while CON-MRK-044 already existed, handing two
  // people the same serial.
  const rows = await prisma.employee.findMany({ select: { employeeCode: true } })

  let maxN = 0
  for (const r of rows) {
    const m = /^CON-[A-Z]+-(\d+)$/.exec(r.employeeCode ?? '')
    if (!m) continue
    const n = parseInt(m[1], 10)
    if (Number.isFinite(n) && n > maxN) maxN = n
  }

  const nextNum = maxN + 1
  const next = `CON-${deptCode}-${String(nextNum).padStart(3, '0')}`
  return NextResponse.json({ next, deptCode, nextNum })
}

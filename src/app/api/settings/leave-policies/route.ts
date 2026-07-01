import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

async function gateHR(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return { error: 'Unauthorized', status: 401 as const }
  const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { role: true } })
  if (!user || user.role !== 'HR_ADMIN') return { error: 'Forbidden', status: 403 as const }
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return { error: 'Switch back to HR view to manage leave policies', status: 403 as const }
  }
  return { ok: true as const }
}

/**
 * GET — return all leave policies. Any authenticated user can read so the
 *      transposed leave matrix on the settings page can render for HR.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const policies = await prisma.leavePolicy.findMany({
    orderBy: [{ leaveType: 'asc' }, { employeeType: 'asc' }],
  })
  return NextResponse.json({ policies })
}

/**
 * POST — upsert a single cell of the transposed leave matrix. Body:
 *   { employeeType, leaveType, daysPerYear }
 * Used by the HR settings UI when an HR_ADMIN clicks a cell to edit
 * the allotted days for a (leave type × audience tier) combination.
 */
export async function POST(request: NextRequest) {
  const gate = await gateHR(request)
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const body = await request.json().catch(() => ({}))
  const employeeType = String(body.employeeType ?? '').toUpperCase().trim()
  const leaveType = String(body.leaveType ?? '').toUpperCase().trim()
  const daysPerYear = Number(body.daysPerYear ?? 0)
  if (!employeeType || !leaveType) {
    return NextResponse.json({ error: 'employeeType and leaveType are required' }, { status: 400 })
  }
  if (!Number.isFinite(daysPerYear) || daysPerYear < 0) {
    return NextResponse.json({ error: 'daysPerYear must be a non-negative number' }, { status: 400 })
  }

  // PROBATION / INTERNSHIP / TRAINING staff accrue 1 day per month worked.
  // PERMANENT employees get the full annual quota one-shot.
  const accrualPerMonth = employeeType === 'PERMANENT' ? null : 1

  const policy = await prisma.leavePolicy.upsert({
    where: { employeeType_leaveType: { employeeType, leaveType } },
    update: { daysPerYear, accrualPerMonth },
    create: { employeeType, leaveType, daysPerYear, accrualPerMonth },
  })
  return NextResponse.json({ policy })
}

/**
 * GET /api/payroll/[id]/anomalies
 *
 * AutoPilot review surface — instead of an 8-stage approval chain, HR sees
 * only the items that differ meaningfully from the prior month. The rest is
 * assumed-good and rolled up into a single counter.
 *
 * Anomaly detection logic lives in src/lib/queries/payroll.ts so the
 * /dashboard/payroll server component can render it without a client fetch.
 *
 * Returns:
 *   { run, anomalies: [{ payslipId, employeeName, code, kind, summary, delta }], clean: number }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { getPayrollAnomalies } from '@/lib/queries/payroll'

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, userRoles: { select: { role: true } } },
  })
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const allRoles = new Set([me.role, ...me.userRoles.map((r) => r.role)])
  if (!['HR_ADMIN', 'EXECUTIVE'].some((r) => allRoles.has(r))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const result = await getPayrollAnomalies(id)
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(result)
}

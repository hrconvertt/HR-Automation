/**
 * /api/exit-clearance
 *
 * GET  â€” list clearances (HR-only). Includes basic employee info + status.
 * POST â€” initiate a new clearance for an employee. Body: { employeeId, lastWorkingDay? }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { computeFinalSettlement } from '@/lib/final-settlement'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const clearances = await prisma.exitClearance.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      employee: {
        select: {
          id: true, fullName: true, employeeCode: true, designation: true,
          status: true, exitDate: true,
          department: { select: { name: true } },
        },
      },
    },
  })
  return NextResponse.json({ clearances })
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'View-only while previewing role' }, { status: 403 })
  }

  let body: Record<string, unknown> = {}
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }
  const employeeId = String(body.employeeId ?? '')
  if (!employeeId) return NextResponse.json({ error: 'employeeId required' }, { status: 400 })
  const lastWorkingDay = body.lastWorkingDay ? new Date(String(body.lastWorkingDay)) : null

  const settlement = await computeFinalSettlement(employeeId, lastWorkingDay).catch(() => null)
  const clearance = await prisma.exitClearance.create({
    data: {
      employeeId,
      initiatedById: payload.userId,
      lastWorkingDay,
      prorataSalary: settlement?.prorataSalary ?? null,
      leaveEncashment: settlement?.leaveEncashment ?? null,
      outstandingDeductions: settlement?.outstandingDeductions ?? null,
      finalSettlementAmount: settlement?.finalSettlementAmount ?? null,
    },
  })
  return NextResponse.json({ clearance })
}

/**
 * GET  /api/payroll/advances — all salary advances/loans with employee + status.
 * POST /api/payroll/advances — record a new advance.
 * HR only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'

async function gateHR(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!hasRole(payload, 'HR_ADMIN')) return { error: NextResponse.json({ error: 'HR only' }, { status: 403 }) }
  return { payload }
}

export async function GET(request: NextRequest) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error

  const advances = await prisma.salaryAdvance.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    include: { employee: { select: { id: true, fullName: true, employeeCode: true } } },
  })
  return NextResponse.json({ advances })
}

export async function POST(request: NextRequest) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error
  const body = await request.json().catch(() => ({}))

  const employeeId = String(body.employeeId ?? '')
  const principal = Number(body.principal)
  const installmentAmount = Number(body.installmentAmount)
  if (!employeeId) return NextResponse.json({ error: 'Pick an employee' }, { status: 400 })
  if (!Number.isFinite(principal) || principal <= 0) {
    return NextResponse.json({ error: 'Enter a valid amount' }, { status: 400 })
  }
  if (!Number.isFinite(installmentAmount) || installmentAmount <= 0) {
    return NextResponse.json({ error: 'Enter a valid monthly installment' }, { status: 400 })
  }

  const advance = await prisma.salaryAdvance.create({
    data: {
      employeeId,
      principal,
      installmentAmount,
      remaining: principal,
      reason: body.reason ? String(body.reason).slice(0, 300) : null,
      status: 'pending',
    },
    select: { id: true },
  })
  return NextResponse.json({ ok: true, advance }, { status: 201 })
}

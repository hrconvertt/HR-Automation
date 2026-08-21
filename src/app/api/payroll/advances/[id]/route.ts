/**
 * PATCH  /api/payroll/advances/[id] — approve, reject, record a repayment, or edit.
 * DELETE /api/payroll/advances/[id] — remove an advance record.
 * HR only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'

interface RouteParams { params: Promise<{ id: string }> }

async function gate(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!hasRole(payload, 'HR_ADMIN')) return { error: NextResponse.json({ error: 'HR only' }, { status: 403 }) }
  return { payload }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await gate(request)
  if (auth.error) return auth.error
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const action = String(body.action ?? '')

  const advance = await prisma.salaryAdvance.findUnique({ where: { id } })
  if (!advance) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data: Record<string, unknown> = {}

  if (action === 'approve') {
    data.status = 'active'
    data.approvedById = auth.payload.userId ?? null
    data.approvedAt = new Date()
  } else if (action === 'reject') {
    data.status = 'rejected'
  } else if (action === 'record_payment') {
    // Deduct one installment (or a supplied amount) from the balance.
    const pay = body.amount !== undefined ? Number(body.amount) : advance.installmentAmount
    const remaining = Math.max(0, advance.remaining - (Number.isFinite(pay) ? pay : 0))
    data.remaining = remaining
    if (remaining === 0) data.status = 'completed'
  } else if (action === 'edit') {
    if (body.installmentAmount !== undefined) {
      const v = Number(body.installmentAmount)
      if (Number.isFinite(v) && v > 0) data.installmentAmount = v
    }
    if (body.reason !== undefined) data.reason = String(body.reason).slice(0, 300)
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  const updated = await prisma.salaryAdvance.update({ where: { id }, data })
  return NextResponse.json({ ok: true, advance: updated })
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await gate(request)
  if (auth.error) return auth.error
  const { id } = await params
  await prisma.salaryAdvance.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

/**
 * PATCH  /api/settings/tax-slabs/[id] — edit one bracket.
 * DELETE /api/settings/tax-slabs/[id] — remove one bracket.
 * HR only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'

interface RouteParams { params: Promise<{ id: string }> }

async function gateHR(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!hasRole(payload, 'HR_ADMIN')) return { error: NextResponse.json({ error: 'HR only' }, { status: 403 }) }
  return { payload }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const data: Record<string, unknown> = {}
  if (body.incomeFrom !== undefined) {
    const v = Number(body.incomeFrom)
    if (!Number.isFinite(v) || v < 0) return NextResponse.json({ error: 'Invalid "from" income' }, { status: 400 })
    data.incomeFrom = v
  }
  if (body.incomeTo !== undefined) {
    data.incomeTo = body.incomeTo === null || body.incomeTo === '' ? null : Number(body.incomeTo)
  }
  if (body.ratePercent !== undefined) {
    const v = Number(body.ratePercent)
    data.ratePercent = Number.isFinite(v) && v >= 0 ? v : 0
  }
  if (body.fixedAmount !== undefined) {
    const v = Number(body.fixedAmount)
    data.fixedAmount = Number.isFinite(v) && v >= 0 ? v : 0
  }

  const slab = await prisma.taxSlab.update({ where: { id }, data })
  return NextResponse.json({ ok: true, slab })
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error
  const { id } = await params
  await prisma.taxSlab.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

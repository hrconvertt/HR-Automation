/**
 * PATCH  /api/learning/records/[id] — update an enrolment: status, score, dates.
 * DELETE /api/learning/records/[id] — remove the enrolment.
 *
 * Marking it COMPLETED stamps the end date if one is not set, so a finished
 * course always has a completion date to report against.
 *
 * HR only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { RECORD_STATUSES } from '@/lib/learning'

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
  if ((RECORD_STATUSES as readonly string[]).includes(body.status)) {
    data.status = body.status
    if (body.status === 'COMPLETED') {
      const existing = await prisma.trainingRecord.findUnique({ where: { id }, select: { endDate: true } })
      if (!existing?.endDate) data.endDate = new Date()
    }
  }
  if (body.score !== undefined) {
    const n = Number(body.score)
    data.score = body.score === '' || body.score == null || !Number.isFinite(n) ? null : n
  }
  if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).slice(0, 2000) : null
  if (body.certificate !== undefined) data.certificate = body.certificate ? String(body.certificate).slice(0, 500) : null
  for (const k of ['startDate', 'endDate'] as const) {
    if (body[k] === undefined) continue
    if (!body[k]) { data[k] = k === 'endDate' ? null : undefined; continue }
    const d = new Date(`${String(body[k]).slice(0, 10)}T00:00:00Z`)
    if (!Number.isNaN(d.getTime())) data[k] = d
  }

  const record = await prisma.trainingRecord.update({ where: { id }, data })
  return NextResponse.json({ ok: true, record })
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await gateHR(request)
  if (auth.error) return auth.error
  const { id } = await params
  await prisma.trainingRecord.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

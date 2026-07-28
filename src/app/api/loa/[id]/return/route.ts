import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { LOA_EMPLOYEE_SELECT, requireLoaHR, serializeLoa } from '@/lib/loa'

interface RouteParams { params: Promise<{ id: string }> }

// POST /api/loa/[id]/return — mark the employee as returned. HR_ADMIN only,
// preview-blocked. body: { actualReturn? } (defaults to today) → status RETURNED.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await requireLoaHR(request, { write: true })
  if ('error' in auth) return auth.error

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const actualReturn = body.actualReturn ? new Date(body.actualReturn) : new Date()
  if (Number.isNaN(actualReturn.getTime())) {
    return NextResponse.json({ error: 'Invalid actualReturn date' }, { status: 400 })
  }

  const loa = await prisma.leaveOfAbsence.findUnique({ where: { id } })
  if (!loa) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (loa.status !== 'ACTIVE' && loa.status !== 'EXTENDED') {
    return NextResponse.json({ error: `This leave is already ${loa.status.toLowerCase()}` }, { status: 400 })
  }
  if (actualReturn < loa.startDate) {
    return NextResponse.json({ error: 'Return date cannot be before the leave started' }, { status: 400 })
  }

  const updated = await prisma.leaveOfAbsence.update({
    where: { id },
    data: { status: 'RETURNED', actualReturn },
    include: { employee: { select: LOA_EMPLOYEE_SELECT } },
  })

  return NextResponse.json({ loa: serializeLoa(updated) })
}

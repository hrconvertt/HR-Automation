import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { LOA_EMPLOYEE_SELECT, requireLoaHR, serializeLoa } from '@/lib/loa'

interface RouteParams { params: Promise<{ id: string }> }

// POST /api/loa/[id]/extend — push the expected return out. HR_ADMIN only,
// preview-blocked. body: { expectedReturn } (required) → status EXTENDED.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await requireLoaHR(request, { write: true })
  if ('error' in auth) return auth.error

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const expectedReturn = body.expectedReturn ? new Date(body.expectedReturn) : null
  if (!expectedReturn || Number.isNaN(expectedReturn.getTime())) {
    return NextResponse.json({ error: 'Valid expectedReturn required' }, { status: 400 })
  }

  const loa = await prisma.leaveOfAbsence.findUnique({ where: { id } })
  if (!loa) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (loa.status !== 'ACTIVE' && loa.status !== 'EXTENDED') {
    return NextResponse.json({ error: `Only open leaves can be extended (this one is ${loa.status})` }, { status: 400 })
  }
  if (expectedReturn <= loa.startDate) {
    return NextResponse.json({ error: 'New expected return must be after the leave start date' }, { status: 400 })
  }
  if (expectedReturn <= loa.expectedReturn) {
    return NextResponse.json({ error: 'New expected return must be later than the current one' }, { status: 400 })
  }

  const updated = await prisma.leaveOfAbsence.update({
    where: { id },
    data: { status: 'EXTENDED', expectedReturn },
    include: { employee: { select: LOA_EMPLOYEE_SELECT } },
  })

  return NextResponse.json({ loa: serializeLoa(updated) })
}

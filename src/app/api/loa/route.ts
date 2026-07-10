import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  LOA_TYPES, LOA_STATUSES, LOA_TYPE_LABEL, LOA_EMPLOYEE_SELECT,
  type LoaType, requireLoaHR, serializeLoa,
} from '@/lib/loa'

// GET /api/loa?status=  — HR_ADMIN only. status filter: ACTIVE | RETURNED | EXTENDED
// (special value OPEN = ACTIVE + EXTENDED, what the "Active" tab shows).
export async function GET(request: NextRequest) {
  const auth = await requireLoaHR(request)
  if ('error' in auth) return auth.error

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  let where: Record<string, unknown> = {}
  if (status === 'OPEN') where = { status: { in: ['ACTIVE', 'EXTENDED'] } }
  else if (status && (LOA_STATUSES as readonly string[]).includes(status)) where = { status }

  const rows = await prisma.leaveOfAbsence.findMany({
    where,
    orderBy: [{ status: 'asc' }, { expectedReturn: 'asc' }],
    take: 300,
    include: { employee: { select: LOA_EMPLOYEE_SELECT } },
  })

  return NextResponse.json({ loas: rows.map(serializeLoa) })
}

// POST /api/loa — start a leave of absence. HR_ADMIN only, preview-blocked.
// body: { employeeId, type, startDate, expectedReturn, paid?, notes? }
export async function POST(request: NextRequest) {
  const auth = await requireLoaHR(request, { write: true })
  if ('error' in auth) return auth.error

  const body = await request.json().catch(() => ({}))
  const employeeId = String(body.employeeId ?? '')
  const type = String(body.type ?? '') as LoaType
  const startDate = body.startDate ? new Date(body.startDate) : null
  const expectedReturn = body.expectedReturn ? new Date(body.expectedReturn) : null
  const paid = body.paid === true
  const notes = (body.notes ?? '').toString().trim() || null

  if (!employeeId) return NextResponse.json({ error: 'employeeId required' }, { status: 400 })
  if (!LOA_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Invalid leave type' }, { status: 400 })
  }
  if (!startDate || Number.isNaN(startDate.getTime())) {
    return NextResponse.json({ error: 'Valid startDate required' }, { status: 400 })
  }
  if (!expectedReturn || Number.isNaN(expectedReturn.getTime())) {
    return NextResponse.json({ error: 'Valid expectedReturn required' }, { status: 400 })
  }
  if (expectedReturn <= startDate) {
    return NextResponse.json({ error: 'Expected return must be after the start date' }, { status: 400 })
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, fullName: true, status: true },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
  if (employee.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Leaves of absence can only be started for active employees' }, { status: 400 })
  }

  // One open LOA per employee at a time.
  const open = await prisma.leaveOfAbsence.findFirst({
    where: { employeeId, status: { in: ['ACTIVE', 'EXTENDED'] } },
    select: { id: true },
  })
  if (open) {
    return NextResponse.json(
      { error: `${employee.fullName} already has an open leave of absence` },
      { status: 409 },
    )
  }

  const created = await prisma.leaveOfAbsence.create({
    data: {
      employeeId,
      type,
      startDate,
      expectedReturn,
      paid,
      notes,
      status: 'ACTIVE',
      createdById: auth.access.userId,
    },
    include: { employee: { select: LOA_EMPLOYEE_SELECT } },
  })

  return NextResponse.json(
    { loa: serializeLoa(created), typeLabel: LOA_TYPE_LABEL[type] },
    { status: 201 },
  )
}

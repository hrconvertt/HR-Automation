import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  LOA_TYPES, LOA_STATUSES, LOA_TYPE_LABEL, LOA_EMPLOYEE_SELECT,
  type LoaType, requireLoaHR, serializeLoa,
} from '@/lib/loa'
import {
  countryFor, loaPolicyFor, loaPoliciesFor, describeLoaPolicy, DEFAULT_COUNTRY,
} from '@/lib/policy-scope'

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

  // The entitlements in force, so the screen can say what a maternity leave is
  // actually worth instead of leaving HR to remember twelve weeks.
  const forCountry = searchParams.get('country')
  const policies = await loaPoliciesFor(
    forCountry === 'AE' ? 'AE' : DEFAULT_COUNTRY,
  )

  return NextResponse.json({
    loas: rows.map(serializeLoa),
    policies: policies.map((p) => ({ ...p, summary: describeLoaPolicy(p) })),
  })
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

  // What the country grants for this type, and how the request compares.
  // Reported, not refused: a leave can legitimately run past the paid
  // entitlement — the UAE grants 45 unpaid days beyond maternity, and an
  // unpaid extension is a normal outcome. Silence would be the failure here,
  // not the overrun.
  const country = await countryFor(employeeId)
  const policy = await loaPolicyFor(country, type, startDate)
  const requestedDays = Math.round(
    (expectedReturn.getTime() - startDate.getTime()) / 86_400_000,
  )
  const overBy = policy && requestedDays > policy.totalDays
    ? requestedDays - policy.totalDays
    : 0

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
    {
      loa: serializeLoa(created),
      typeLabel: LOA_TYPE_LABEL[type],
      // What it was measured against, and by how much it runs over.
      entitlement: policy
        ? { ...policy, summary: describeLoaPolicy(policy), requestedDays, overBy }
        : null,
    },
    { status: 201 },
  )
}

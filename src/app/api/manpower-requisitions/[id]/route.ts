/**
 * PATCH /api/manpower-requisitions/[id] — save the form.
 *
 * The whole document in one call, like the appraisal form: it is filled in at
 * one sitting, and a half-saved requisition with its detail but not its
 * approvals is worse than no save.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

const STATUSES = new Set(['DRAFT', 'SUBMITTED', 'APPROVED'])
const APPOINTMENT = new Set(['PERMANENT', 'TEMPORARY'])
const NATURE = new Set(['REPLACEMENT', 'ADDITION', 'NEW_POSITION'])

const text = (v: unknown, max = 500) =>
  typeof v === 'string' && v.trim() ? v.slice(0, max) : null

const date = (v: unknown) =>
  typeof v === 'string' && v ? new Date(v + 'T00:00:00Z') : null

const count = (v: unknown) =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 100000 ? v : null

const tri = (v: unknown) => (v === true ? true : v === false ? false : null)

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN' && payload.role !== 'EXECUTIVE') {
    return NextResponse.json({ error: 'Forbidden — HR only' }, { status: 403 })
  }

  const existing = await prisma.manpowerRequisition.findUnique({
    where: { id }, select: { id: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: Record<string, unknown> = {}
  try { body = await request.json() } catch { /* nothing to save */ }

  const data: Record<string, unknown> = {}

  for (const f of ['jobCode', 'costCenter', 'designation', 'contractDuration',
    'grade', 'departmentHead', 'reportingHead', 'replacingWhom',
    'qualificationMust', 'qualificationAdditional', 'desiredExperience',
    'skills', 'placeOfWork', 'requestedBy', 'divisionHead', 'headHr',
    'director', 'managingDirector'] as const) {
    if (f in body) data[f] = text(body[f])
  }
  if ('workDescription' in body) data.workDescription = text(body.workDescription, 5000)

  for (const f of ['noOfPositions', 'currentPermanent', 'currentTemporary',
    'currentConsultants'] as const) {
    if (f in body) data[f] = count(body[f])
  }

  for (const f of ['sanctioned', 'jdAttached'] as const) {
    if (f in body) data[f] = tri(body[f])
  }

  for (const f of ['fillBy', 'requisitionDate', 'divisionHeadDate', 'headHrDate',
    'directorDate', 'managingDirectorDate'] as const) {
    if (f in body) data[f] = date(body[f])
  }

  if ('appointmentType' in body) {
    const v = body.appointmentType
    data.appointmentType = typeof v === 'string' && APPOINTMENT.has(v) ? v : null
  }
  if ('requirementNature' in body) {
    const v = body.requirementNature
    data.requirementNature = typeof v === 'string' && NATURE.has(v) ? v : null
  }
  if (typeof body.status === 'string' && STATUSES.has(body.status)) {
    data.status = body.status
  }

  const saved = await prisma.manpowerRequisition.update({
    where: { id }, data, select: { id: true, status: true, updatedAt: true },
  })
  return NextResponse.json(saved)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Forbidden — HR only' }, { status: 403 })
  }
  const form = await prisma.manpowerRequisition.findUnique({
    where: { id }, select: { status: true },
  })
  if (!form) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (form.status === 'APPROVED') {
    return NextResponse.json({
      error: 'An approved requisition is a record and cannot be deleted.',
    }, { status: 400 })
  }
  await prisma.manpowerRequisition.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

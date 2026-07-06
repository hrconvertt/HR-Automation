/**
 * /api/recruiting/requisitions/[id]/jd
 *
 *   GET    — return the current JD content + status
 *   PUT    — HR saves edits (keeps status DRAFT_JD)
 *   POST   — HR approves & publishes (jdStatus → POSTED, becomes visible
 *            on the public /careers page)
 *   DELETE — HR re-opens for editing (POSTED → DRAFT_JD)
 *
 * HR_ADMIN only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { generateJD } from '@/lib/jd-generator'

interface RouteParams { params: Promise<{ id: string }> }

async function gateHR(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const me = await prisma.user.findUnique({ where: { id: payload.userId }, select: { id: true, role: true } })
  if (!me || me.role !== 'HR_ADMIN') return { error: NextResponse.json({ error: 'HR only' }, { status: 403 }) }
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return { error: NextResponse.json({ error: 'Switch back to HR view' }, { status: 403 }) }
  }
  return { me }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const req = await prisma.jobRequisition.findUnique({
    where: { id },
    select: {
      id: true, title: true, status: true,
      jdContent: true, jdStatus: true,
      jdGeneratedAt: true, jdApprovedAt: true,
    },
  })
  if (!req) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ requisition: req })
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { error } = await gateHR(request)
  if (error) return error
  const { id } = await params
  const body = await request.json()
  const content = body.content ? String(body.content) : null

  const req = await prisma.jobRequisition.findUnique({ where: { id }, select: { jdStatus: true } })
  if (!req) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (req.jdStatus === 'POSTED') {
    return NextResponse.json({ error: 'Re-open the JD before editing (DELETE first)' }, { status: 409 })
  }

  await prisma.jobRequisition.update({
    where: { id },
    data: { jdContent: content, jdStatus: 'DRAFT_JD' },
  })
  return NextResponse.json({ ok: true })
}

/** Approve & publish — sets jdStatus=POSTED. */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { me, error } = await gateHR(request)
  if (error) return error
  const { id } = await params

  const req = await prisma.jobRequisition.findUnique({
    where: { id },
    select: { jdContent: true, jdStatus: true, status: true },
  })
  if (!req) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (req.status !== 'OPEN') {
    return NextResponse.json({ error: 'Requisition must be OPEN to publish a JD' }, { status: 409 })
  }
  if (!req.jdContent || !req.jdContent.trim()) {
    return NextResponse.json({ error: 'JD content is empty — write or regenerate first' }, { status: 400 })
  }

  await prisma.jobRequisition.update({
    where: { id },
    data: {
      jdStatus: 'POSTED',
      jdApprovedAt: new Date(),
      jdApprovedById: me!.id,
    },
  })
  return NextResponse.json({ ok: true, jdStatus: 'POSTED' })
}

/** Re-open for editing (POSTED → DRAFT_JD). Useful for typo fixes. */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { error } = await gateHR(request)
  if (error) return error
  const { id } = await params
  await prisma.jobRequisition.update({
    where: { id },
    data: { jdStatus: 'DRAFT_JD', jdApprovedAt: null, jdApprovedById: null },
  })
  return NextResponse.json({ ok: true })
}

/** Helper that other code can call to regenerate the JD from a request's
    current fields (e.g. if the title changed). Exposed via PATCH for now. */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { error } = await gateHR(request)
  if (error) return error
  const { id } = await params
  const full = await prisma.jobRequisition.findUnique({ where: { id } })
  if (!full) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (full.jdStatus === 'POSTED') {
    return NextResponse.json({ error: 'Re-open the JD before regenerating' }, { status: 409 })
  }
  const dept = full.departmentId
    ? await prisma.department.findUnique({ where: { id: full.departmentId }, select: { name: true } })
    : null
  const fresh = generateJD({
    title: full.title,
    departmentName: dept?.name,
    type: full.type,
    vacancies: full.vacancies,
    reason: full.requestReason,
    requestNote: full.requestNote,
  })
  await prisma.jobRequisition.update({
    where: { id },
    data: { jdContent: fresh, jdStatus: 'DRAFT_JD', jdGeneratedAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}

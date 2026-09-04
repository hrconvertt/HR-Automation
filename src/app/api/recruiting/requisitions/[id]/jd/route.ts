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
import { requisitionAuthorised } from '@/lib/requisition-gate'
import { verifyToken } from '@/lib/auth'
import { generateJD } from '@/lib/jd-generator'
import { trackingToken } from '@/lib/job-posting'

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
    select: { jdContent: true, jdStatus: true, status: true, postedDate: true },
  })
  if (!req) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Nothing reaches a candidate before the requisition is authorised — see
  // src/lib/requisition-gate.ts. Roles raised before the form existed are
  // grandfathered.
  const gate = await requisitionAuthorised(id)
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 409 })

  if (req.status !== 'OPEN') {
    return NextResponse.json({ error: 'Requisition must be OPEN to publish a JD' }, { status: 409 })
  }
  if (!req.jdContent || !req.jdContent.trim()) {
    return NextResponse.json({ error: 'JD content is empty — write or regenerate first' }, { status: 400 })
  }

  const now = new Date()
  await prisma.jobRequisition.update({
    where: { id },
    data: {
      jdStatus: 'POSTED',
      jdApprovedAt: now,
      jdApprovedById: me!.id,
      postedDate: req.postedDate ?? now,
    },
  })

  // Publishing puts the role on the public careers page, so that advert now
  // exists and belongs on Job Post Payments. It is free — the careers page
  // costs nothing — and HR edits the row or adds a LinkedIn one beside it.
  //
  // Re-published after a re-open? Reopen the same row instead of stacking a
  // second one; it is the same advert coming back up.
  const existing = await prisma.jobPosting.findFirst({
    where: { requisitionId: id, platform: 'CAREERS_PAGE' },
    select: { id: true },
  })
  if (existing) {
    await prisma.jobPosting.update({
      where: { id: existing.id },
      data: { status: 'ACTIVE', closedAt: null },
    })
  } else {
    await prisma.jobPosting.create({
      data: {
        requisitionId: id,
        platform: 'CAREERS_PAGE',
        trackingToken: trackingToken('CAREERS_PAGE', now),
        postedAt: now,
        budget: 0,
        cost: 0,
        currency: 'AED',
        status: 'ACTIVE',
        postedBy: me!.id,
        notes: 'Opened automatically when the JD was approved and published.',
      },
    })
  }

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

  // The role comes off the careers page while it is being edited, so the
  // advert it opened stops being live. Paid postings are left alone — taking
  // a JD down for a typo does not stop LinkedIn billing.
  await prisma.jobPosting.updateMany({
    where: { requisitionId: id, platform: 'CAREERS_PAGE', status: 'ACTIVE' },
    data: { status: 'PAUSED', closedAt: new Date() },
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
    minExperienceYears: full.minExperienceYears,
    salaryMin: full.salaryMin,
    salaryMax: full.salaryMax,
  })
  await prisma.jobRequisition.update({
    where: { id },
    data: { jdContent: fresh, jdStatus: 'DRAFT_JD', jdGeneratedAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}

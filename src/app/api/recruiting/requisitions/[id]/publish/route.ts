/**
 * POST /api/recruiting/requisitions/[id]/publish — the editor's last button.
 *
 *   HR       → Publish. The job opens and goes on the careers page. Same gate
 *              as publishing a JD from the board: nothing reaches a candidate
 *              until the requisition is authorised (requisition-gate.ts).
 *   MANAGER  → Submit for approval. Their draft becomes a request, and HR
 *              decides it from Requests exactly as before.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requisitionAuthorised } from '@/lib/requisition-gate'
import {
  canEditJob, notifyHrOfHiringRequest, openCareersPosting, resolveJobActor,
} from '@/lib/job-post-server'
import { missingForPublish, parseSections } from '@/lib/job-post'

interface RouteParams { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: RouteParams) {
  const actor = await resolveJobActor(request)
  if (actor instanceof NextResponse) return actor
  const { id } = await params

  const req = await prisma.jobRequisition.findUnique({
    where: { id },
    select: {
      id: true, title: true, status: true, requestedById: true, vacancies: true,
      departmentId: true, jdContent: true, jdSections: true, postedDate: true,
      requestedBy: { select: { fullName: true } },
    },
  })
  if (!req) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canEditJob(actor, req)) {
    return NextResponse.json({ error: 'You can only submit a job you raised.' }, { status: 403 })
  }

  // A job written before the editor has markdown and no sections; it only
  // needs a body. One written in the editor needs its required boxes.
  const sections = parseSections(req.jdSections)
  const missing = sections
    ? missingForPublish({ title: req.title, departmentId: req.departmentId }, sections)
    : (req.jdContent?.trim() ? [] : ['Description'])
  if (missing.length) {
    return NextResponse.json(
      { error: `Fill in ${missing.join(', ')} on The Job first.` },
      { status: 400 },
    )
  }

  if (!actor.isHR) {
    if (req.status !== 'DRAFT') {
      return NextResponse.json({ error: 'This job has already been sent to HR.' }, { status: 409 })
    }
    await prisma.jobRequisition.update({ where: { id }, data: { status: 'PENDING' } })
    await notifyHrOfHiringRequest({
      id, title: req.title, vacancies: req.vacancies, managerName: req.requestedBy?.fullName ?? null,
    })
    return NextResponse.json({ ok: true, status: 'PENDING' })
  }

  if (req.status === 'PENDING') {
    return NextResponse.json(
      { error: 'This is a manager’s request. Approve it on the board first, then publish.' },
      { status: 409 },
    )
  }
  if (req.status !== 'DRAFT' && req.status !== 'OPEN') {
    return NextResponse.json(
      { error: `A ${req.status.toLowerCase()} job cannot be published. Reopen it first.` },
      { status: 409 },
    )
  }

  const gate = await requisitionAuthorised(id)
  if (!gate.ok) {
    return NextResponse.json({ error: gate.reason, needsForm: true }, { status: 409 })
  }

  const now = new Date()
  await prisma.jobRequisition.update({
    where: { id },
    data: {
      status: 'OPEN',
      postedDate: req.postedDate ?? now,
      jdStatus: 'POSTED',
      jdApprovedAt: now,
      jdApprovedById: actor.userId,
    },
  })
  await openCareersPosting(id, actor.userId, now)
  return NextResponse.json({ ok: true, status: 'OPEN' })
}

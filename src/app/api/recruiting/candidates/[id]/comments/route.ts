/**
 * /api/recruiting/candidates/[id]/comments — notes on a candidate for the hiring team.
 *
 *   GET                                      what this viewer may read
 *   POST { body, visibility, mentions[] }    add one; everyone mentioned is notified
 *
 * Comments are never shown to the candidate. HR-only comments are hidden from
 * hiring managers.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveJobActor } from '@/lib/job-post-server'
import { notify } from '@/lib/notifications'
import { COMMENT_VISIBILITY } from '@/lib/candidate-review-labels'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Ctx) {
  const actor = await resolveJobActor(request)
  if (actor instanceof NextResponse) return actor
  const { id } = await params
  const comments = await prisma.candidateComment.findMany({
    where: { candidateId: id, ...(actor.isHR ? {} : { visibility: { not: 'HR' } }) },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ comments })
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const actor = await resolveJobActor(request)
  if (actor instanceof NextResponse) return actor
  const { id } = await params
  const c = await prisma.candidate.findUnique({
    where: { id }, select: { fullName: true, requisitionId: true, requisition: { select: { title: true } } },
  })
  if (!c) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
  const b = await request.json().catch(() => ({})) as { body?: string; visibility?: string; mentions?: unknown }
  const body = (b.body ?? '').trim().slice(0, 4000)
  if (!body) return NextResponse.json({ error: 'Write the comment first.' }, { status: 400 })
  const visibility = COMMENT_VISIBILITY.some((v) => v.key === b.visibility) ? b.visibility! : 'HIRING_TEAM'
  if (visibility === 'HR' && !actor.isHR) return NextResponse.json({ error: 'Only HR can write HR-only comments.' }, { status: 403 })
  const mentions = [...new Set((Array.isArray(b.mentions) ? b.mentions : []).filter((x): x is string => typeof x === 'string'))].slice(0, 20)

  const me = actor.employeeId
    ? await prisma.employee.findUnique({ where: { id: actor.employeeId }, select: { fullName: true } })
    : null
  const comment = await prisma.candidateComment.create({
    data: { candidateId: id, authorUserId: actor.userId, authorName: me?.fullName ?? 'HR', body, visibility, mentions },
  })
  for (const m of mentions) {
    if (m === actor.employeeId) continue
    await notify({
      employeeId: m,
      type: 'GENERAL',
      title: `${me?.fullName ?? 'HR'} mentioned you on ${c.fullName}`,
      message: `${c.requisition.title}: ${body.slice(0, 200)}`,
      link: `/dashboard/recruiting/jobs/${c.requisitionId}/candidates?c=${id}`,
    })
  }
  return NextResponse.json({ comment }, { status: 201 })
}

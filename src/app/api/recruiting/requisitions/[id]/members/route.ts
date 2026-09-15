/**
 * /api/recruiting/requisitions/[id]/members — a job's hiring team.
 *
 *   POST   body: { employeeId, role: 'HIRING_MANAGER' | 'INTERVIEWER' }
 *          Adds the person (or changes their role) and tells them.
 *   DELETE ?memberId=… — takes them off the team.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canEditJob, resolveJobActor } from '@/lib/job-post-server'

interface RouteParams { params: Promise<{ id: string }> }

const ROLES = ['HIRING_MANAGER', 'INTERVIEWER']

async function load(request: NextRequest, id: string) {
  const actor = await resolveJobActor(request)
  if (actor instanceof NextResponse) return { error: actor }
  const req = await prisma.jobRequisition.findUnique({
    where: { id },
    select: { id: true, title: true, status: true, requestedById: true },
  })
  if (!req) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  if (!canEditJob(actor, req)) {
    return { error: NextResponse.json({ error: 'You cannot change this job’s team.' }, { status: 403 }) }
  }
  return { actor, req }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const loaded = await load(request, id)
  if ('error' in loaded) return loaded.error
  const { actor, req } = loaded

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const employeeId = String(body.employeeId ?? '')
  const role = ROLES.includes(String(body.role)) ? String(body.role) : 'INTERVIEWER'

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, fullName: true },
  })
  if (!employee) return NextResponse.json({ error: 'Pick someone to add.' }, { status: 400 })

  const existing = await prisma.requisitionMember.findUnique({
    where: { requisitionId_employeeId: { requisitionId: id, employeeId } },
    select: { id: true },
  })
  const member = await prisma.requisitionMember.upsert({
    where: { requisitionId_employeeId: { requisitionId: id, employeeId } },
    update: { role },
    create: { requisitionId: id, employeeId, role, addedById: actor.userId },
  })

  if (!existing) {
    await prisma.notification.create({
      data: {
        employeeId,
        type: 'HIRING_TEAM',
        title: `You're on the hiring team for ${req.title}`,
        message: role === 'HIRING_MANAGER'
          ? 'You were added as the hiring manager.'
          : 'You were added as an interviewer. Interviews you are booked into will appear in Recruiting.',
        link: '/dashboard/recruiting?tab=schedule',
      },
    })
  }
  return NextResponse.json({ ok: true, member })
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const loaded = await load(request, id)
  if ('error' in loaded) return loaded.error
  const memberId = request.nextUrl.searchParams.get('memberId') ?? ''
  await prisma.requisitionMember.deleteMany({ where: { id: memberId, requisitionId: id } })
  return NextResponse.json({ ok: true })
}

/**
 * POST /api/talent/mentorships — suggest a mentor to a report.
 * body: { menteeId, mentorId, skillId?, message? }
 *
 * The report's manager or HR. Both people are told, with the manager's note —
 * Workday's "share with a message". It starts as Suggested; either of them,
 * the manager or HR marks it Active once they have actually met.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notifications'
import { resolveTalentAccess, canManageTalent, cleanText } from '@/lib/talent'

export async function POST(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as {
    menteeId?: string; mentorId?: string; skillId?: string; message?: string
  }
  const menteeId = typeof body.menteeId === 'string' ? body.menteeId : ''
  const mentorId = typeof body.mentorId === 'string' ? body.mentorId : ''
  if (!menteeId || !mentorId) {
    return NextResponse.json({ error: 'menteeId and mentorId are required' }, { status: 400 })
  }
  if (menteeId === mentorId) {
    return NextResponse.json({ error: 'Somebody cannot mentor themselves.' }, { status: 400 })
  }
  if (!(await canManageTalent(access, menteeId))) {
    return NextResponse.json(
      { error: 'Only HR or the employee’s manager can suggest a mentor.' },
      { status: 403 },
    )
  }

  const [mentee, mentor] = await Promise.all([
    prisma.employee.findUnique({ where: { id: menteeId }, select: { id: true, fullName: true, status: true } }),
    prisma.employee.findUnique({ where: { id: mentorId }, select: { id: true, fullName: true, status: true } }),
  ])
  if (!mentee || mentee.status !== 'ACTIVE' || !mentor || mentor.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Both people must be active employees.' }, { status: 400 })
  }

  let skill: { id: string; name: string } | null = null
  if (typeof body.skillId === 'string' && body.skillId) {
    skill = await prisma.skill.findUnique({ where: { id: body.skillId }, select: { id: true, name: true } })
    if (!skill) return NextResponse.json({ error: 'Skill not found' }, { status: 400 })
  }

  const open = await prisma.mentorship.findFirst({
    where: { menteeId, mentorId, status: { in: ['PROPOSED', 'ACTIVE'] } },
    select: { id: true },
  })
  if (open) {
    return NextResponse.json(
      { error: `${mentor.fullName} is already ${mentee.fullName.split(' ')[0]}’s mentor or has been suggested.` },
      { status: 409 },
    )
  }

  const message = cleanText(body.message, 1000)
  const created = await prisma.mentorship.create({
    data: { menteeId, mentorId, skillId: skill?.id ?? null, message, proposedById: access.userId },
    select: { id: true },
  })

  const about = skill ? ` for ${skill.name}` : ''
  await Promise.all([
    notify({
      employeeId: menteeId,
      type: 'GENERAL',
      title: 'A mentor was suggested for you',
      message: `${access.userName} suggested ${mentor.fullName} as a mentor${about}.${message ? ` “${message}”` : ''}`,
    }),
    notify({
      employeeId: mentorId,
      type: 'GENERAL',
      title: 'You were suggested as a mentor',
      message: `${access.userName} suggested you as a mentor to ${mentee.fullName}${about}.${message ? ` “${message}”` : ''}`,
    }),
  ])

  return NextResponse.json({ mentorship: created }, { status: 201 })
}

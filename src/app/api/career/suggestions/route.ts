/**
 * POST /api/career/suggestions — point a report to a flex team, a colleague
 * to meet, or a role, with a message.
 * body: { employeeId, kind: 'FLEX_TEAM' | 'CONNECTION' | 'ROLE', refId, message? }
 *
 * Their manager or HR. It lands on the person's Career Hub under
 * "Suggestions from your manager", and they are notified.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notifications'
import { resolveTalentAccess, canManageTalent, cleanText } from '@/lib/talent'
import { SUGGESTION_KINDS } from '@/lib/talent-labels'

export async function POST(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as {
    employeeId?: string; kind?: string; refId?: string; message?: string
  }
  const employeeId = typeof body.employeeId === 'string' ? body.employeeId : ''
  const kind = body.kind ?? ''
  const refId = cleanText(body.refId, 200)
  if (!employeeId || !refId || !(SUGGESTION_KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: 'employeeId, kind and refId are required' }, { status: 400 })
  }
  if (!(await canManageTalent(access, employeeId))) {
    return NextResponse.json({ error: 'Only HR or the employee’s manager can share suggestions.' }, { status: 403 })
  }

  let what = refId
  if (kind === 'FLEX_TEAM') {
    const t = await prisma.flexTeam.findUnique({ where: { id: refId }, select: { title: true } })
    if (!t) return NextResponse.json({ error: 'Flex team not found' }, { status: 400 })
    what = `the flex team "${t.title}"`
  } else if (kind === 'CONNECTION') {
    const p = await prisma.employee.findUnique({ where: { id: refId }, select: { fullName: true, status: true } })
    if (!p || p.status !== 'ACTIVE' || refId === employeeId) {
      return NextResponse.json({ error: 'Pick an active colleague.' }, { status: 400 })
    }
    what = `meeting ${p.fullName}`
  } else {
    what = `the ${refId} role`
  }

  const dup = await prisma.careerSuggestion.findFirst({
    where: { employeeId, kind, refId, dismissedAt: null }, select: { id: true },
  })
  if (dup) return NextResponse.json({ error: 'That is already on their Career Hub.' }, { status: 409 })

  const message = cleanText(body.message, 1000)
  await prisma.careerSuggestion.create({
    data: { employeeId, kind, refId, message, suggestedById: access.employeeId },
  })
  await notify({
    employeeId,
    type: 'GENERAL',
    title: 'A suggestion from your manager',
    message: `${access.userName} suggested ${what}.${message ? ` “${message}”` : ''}`,
    link: '/dashboard/career',
  })
  return NextResponse.json({ ok: true }, { status: 201 })
}

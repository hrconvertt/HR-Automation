/**
 * Flex teams — short projects people join alongside their job.
 *
 *   GET  ?all=1  every team (default: open ones), with the viewer's own status
 *   POST         create one — HR, managers and executives
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveTalentAccess, parseDay, cleanText } from '@/lib/talent'
import { canRunFlexTeams } from '@/lib/flex-teams'
import { FLEX_WORK_MODE_VALUES } from '@/lib/talent-labels'
import { flexTeamCards } from '@/lib/queries/career'

export async function GET(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const all = request.nextUrl.searchParams.get('all') === '1'
  const teams = await flexTeamCards({ employeeId: access.employeeId, onlyOpen: !all })
  return NextResponse.json({ teams })
}

export async function POST(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canRunFlexTeams(access)) {
    return NextResponse.json({ error: 'HR, managers and executives create flex teams.' }, { status: 403 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    title?: string; category?: string; description?: string; location?: string; workMode?: string
    hoursPerWeek?: string; startDate?: string; endDate?: string; spots?: number; hostId?: string; skills?: unknown
  }
  const title = cleanText(body.title, 140)
  if (!title) return NextResponse.json({ error: 'Name the flex team.' }, { status: 400 })

  let hostId = access.employeeId
  if (typeof body.hostId === 'string' && body.hostId) {
    const h = await prisma.employee.findUnique({ where: { id: body.hostId }, select: { id: true, status: true } })
    if (!h || h.status !== 'ACTIVE') return NextResponse.json({ error: 'The host must be an active employee.' }, { status: 400 })
    hostId = h.id
  }

  const skillNames = Array.isArray(body.skills)
    ? body.skills.map((s) => cleanText(s, 80)).filter((s): s is string => !!s).slice(0, 12)
    : []
  const skillIds: string[] = []
  for (const name of skillNames) {
    const existing = await prisma.skill.findFirst({ where: { name: { equals: name, mode: 'insensitive' } }, select: { id: true } })
    const s = existing ?? await prisma.skill.create({ data: { name }, select: { id: true } })
    if (!skillIds.includes(s.id)) skillIds.push(s.id)
  }

  const team = await prisma.flexTeam.create({
    data: {
      title,
      category: cleanText(body.category, 80),
      description: cleanText(body.description, 3000),
      location: cleanText(body.location, 120),
      workMode: FLEX_WORK_MODE_VALUES.includes(body.workMode ?? '') ? body.workMode! : 'REMOTE',
      hoursPerWeek: cleanText(body.hoursPerWeek, 40),
      startDate: parseDay(body.startDate),
      endDate: parseDay(body.endDate),
      spots: typeof body.spots === 'number' && body.spots > 0 ? Math.floor(body.spots) : null,
      hostId,
      createdById: access.userId,
      skills: { create: skillIds.map((skillId) => ({ skillId })) },
    },
    select: { id: true },
  })
  return NextResponse.json({ team }, { status: 201 })
}

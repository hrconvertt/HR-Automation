/**
 * Skill ratings — the panel behind a skill chip on a profile.
 *
 *   GET  ?employeeId=&skillId=   the score out of five, the self rating, the
 *                                ratings from others, external evidence and
 *                                the breakdown; plus whether the viewer may rate
 *   POST { employeeId, skillId, rating: 1-5, note? }
 *
 * Who may rate: the person themselves (Self), their manager (Manager), HR
 * (HR), and a colleague who holds that same skill at Strong or above
 * (Colleague) — somebody who can actually judge it. One rating per rater;
 * rating again replaces your earlier one.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveTalentAccess, canSeeTalent, cleanText, type TalentAccess } from '@/lib/talent'
import { ratingBand, type RatingSource } from '@/lib/talent-labels'

async function raterSource(access: TalentAccess, employeeId: string, skillId: string): Promise<RatingSource | null> {
  if (access.isPreviewMode || !access.employeeId) return null
  if (access.employeeId === employeeId) return 'SELF'
  if (access.actualRole === 'HR_ADMIN') return 'HR'
  const target = await prisma.employee.findUnique({ where: { id: employeeId }, select: { reportingManagerId: true } })
  if (target?.reportingManagerId === access.employeeId) return 'MANAGER'
  const own = await prisma.employeeSkill.findUnique({
    where: { employeeId_skillId: { employeeId: access.employeeId, skillId } }, select: { level: true },
  })
  return own && own.level >= 3 ? 'PEER' : null
}

export async function GET(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const employeeId = request.nextUrl.searchParams.get('employeeId') ?? ''
  const skillId = request.nextUrl.searchParams.get('skillId') ?? ''
  if (!employeeId || !skillId) return NextResponse.json({ error: 'employeeId and skillId are required' }, { status: 400 })

  // Ratings are about somebody's work; the directory view does not show them.
  if (!(await canSeeTalent(access, employeeId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [skill, held, ratings, certs, source] = await Promise.all([
    prisma.skill.findUnique({ where: { id: skillId }, select: { id: true, name: true } }),
    prisma.employeeSkill.findUnique({
      where: { employeeId_skillId: { employeeId, skillId } }, select: { level: true },
    }),
    prisma.skillRating.findMany({
      where: { employeeId, skillId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true, source: true, rating: true, note: true, updatedAt: true, raterId: true,
        rater: { select: { fullName: true } },
      },
    }),
    prisma.certification.findMany({ where: { employeeId }, orderBy: { issuedDate: 'desc' } }),
    raterSource(access, employeeId, skillId),
  ])
  if (!skill) return NextResponse.json({ error: 'Skill not found' }, { status: 404 })

  const avg = ratings.length ? ratings.reduce((s, r) => s + r.rating, 0) / ratings.length : null
  const self = ratings.find((r) => r.source === 'SELF') ?? null
  const others = ratings.filter((r) => r.source !== 'SELF')
  const needle = skill.name.toLowerCase()
  // A certificate is evidence for the skill it names. Nothing links the two
  // tables, so the match is on the name — "Google Ads Search" backs "Google Ads".
  const external = certs.filter((c) => c.name.toLowerCase().includes(needle) || needle.includes(c.name.toLowerCase()))
  const band = avg != null ? ratingBand(avg) : null

  return NextResponse.json({
    skill,
    recordedLevel: held?.level ?? null,
    average: avg != null ? Math.round(avg * 10) / 10 : null,
    band: band ? { label: band.label, blurb: band.blurb } : null,
    self: self ? { rating: self.rating, note: self.note, updatedAt: self.updatedAt } : null,
    others: others.map((r) => ({
      id: r.id, source: r.source, rating: r.rating, note: r.note, updatedAt: r.updatedAt, raterName: r.rater.fullName,
    })),
    breakdown: [1, 2, 3, 4, 5].map((n) => ({ rating: n, count: ratings.filter((r) => r.rating === n).length })),
    external: external.map((c) => ({
      id: c.id, name: c.name, issuedBy: c.issuedBy, issuedDate: c.issuedDate, expiryDate: c.expiryDate,
    })),
    canRate: !!source,
    raterSource: source,
    myRating: access.employeeId ? ratings.find((r) => r.raterId === access.employeeId)?.rating ?? null : null,
  })
}

export async function POST(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as {
    employeeId?: string; skillId?: string; rating?: number; note?: string
  }
  const employeeId = typeof body.employeeId === 'string' ? body.employeeId : ''
  const skillId = typeof body.skillId === 'string' ? body.skillId : ''
  if (!employeeId || !skillId) return NextResponse.json({ error: 'employeeId and skillId are required' }, { status: 400 })
  if (typeof body.rating !== 'number' || ![1, 2, 3, 4, 5].includes(body.rating)) {
    return NextResponse.json({ error: 'Rate from 1 to 5.' }, { status: 400 })
  }
  const source = await raterSource(access, employeeId, skillId)
  if (!source || !access.employeeId) {
    return NextResponse.json(
      { error: 'Only they, their manager, HR, or a colleague strong in this skill can rate it.' },
      { status: 403 },
    )
  }
  const skill = await prisma.skill.findUnique({ where: { id: skillId }, select: { id: true } })
  if (!skill) return NextResponse.json({ error: 'Skill not found' }, { status: 404 })

  await prisma.skillRating.upsert({
    where: { employeeId_skillId_raterId: { employeeId, skillId, raterId: access.employeeId } },
    update: { rating: body.rating, note: cleanText(body.note, 500), source },
    create: { employeeId, skillId, raterId: access.employeeId, source, rating: body.rating, note: cleanText(body.note, 500) },
  })
  return NextResponse.json({ ok: true, source })
}

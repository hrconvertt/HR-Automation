/**
 * PATCH /api/appraisals/[id] — save the form.
 *
 * One endpoint for the whole document rather than one per section: the form
 * is filled in over a single sitting and a half-saved appraisal that has its
 * ratings but not its sign-off is worse than no save at all.
 *
 * DELETE removes a draft. Only a draft — a signed appraisal is a record.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { SECTIONS, MAX_RATING, type Ratings } from '@/lib/appraisal-form'

const VALID_KEYS = new Set(SECTIONS.flatMap((s) => s.criteria.map((c) => c.key)))
const STATUSES = new Set(['DRAFT', 'SUBMITTED', 'REVIEWED', 'FINALISED'])

const date = (v: unknown) =>
  typeof v === 'string' && v ? new Date(v + 'T00:00:00Z') : null

const text = (v: unknown, max = 2000) =>
  typeof v === 'string' ? v.slice(0, max) : null

/** Keep only known criteria and scores inside the 1–5 index. */
function cleanRatings(input: unknown): Ratings {
  const out: Ratings = {}
  if (!input || typeof input !== 'object') return out
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!VALID_KEYS.has(key)) continue
    if (!value || typeof value !== 'object') continue
    const v = value as Record<string, unknown>
    const score = (n: unknown) =>
      typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= MAX_RATING ? n : null
    const appraisee = score(v.appraisee)
    const appraiser = score(v.appraiser)
    if (appraisee == null && appraiser == null) continue
    out[key] = { appraisee, appraiser }
  }
  return out
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.appraisalForm.findUnique({
    where: { id },
    select: { id: true, status: true, employee: { select: { reportingManagerId: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // HR and executives can always edit. A manager can edit their own report's
  // form — they are the appraiser, and the form is useless if only HR can
  // write in it.
  const isHr = payload.role === 'HR_ADMIN' || payload.role === 'EXECUTIVE'
  if (!isHr) {
    const me = await prisma.employee.findFirst({
      where: { userId: payload.userId }, select: { id: true },
    })
    if (!me || existing.employee.reportingManagerId !== me.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }
  if (existing.status === 'FINALISED' && !isHr) {
    return NextResponse.json({ error: 'This appraisal is finalised.' }, { status: 400 })
  }

  let body: Record<string, unknown> = {}
  try { body = await request.json() } catch { /* nothing to save */ }

  const data: Record<string, unknown> = {}

  if ('ratings' in body) data.ratings = cleanRatings(body.ratings)
  if ('goals' in body && Array.isArray(body.goals)) data.goals = body.goals.slice(0, 10)
  if ('development' in body && Array.isArray(body.development)) {
    data.development = body.development.slice(0, 10)
  }
  if ('isManagerial' in body) data.isManagerial = Boolean(body.isManagerial)

  for (const f of ['qualification', 'experienceCompany', 'experienceTotal',
    'periodInPresentPost', 'designationAtReview', 'departmentAtReview',
    'incrementOf', 'promotedTo', 'transferredTo', 'transferredAs'] as const) {
    if (f in body) data[f] = text(body[f], 200)
  }
  if ('trainingNeeds' in body) data.trainingNeeds = text(body.trainingNeeds, 2000)

  // The increment the score works out to, kept with the form. Recomputing it
  // on read would show next year's salary against last year's appraisal.
  const num = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null
  for (const f of ['currentSalary', 'recommendedPct', 'incrementAmount', 'proposedSalary'] as const) {
    if (f in body) data[f] = num(body[f])
  }
  if ('approvedPct' in body) {
    data.approvedPct = body.approvedPct == null ? null : num(body.approvedPct)
  }
  if ('incrementTrack' in body) {
    data.incrementTrack = body.incrementTrack === 'BIANNUAL' ? 'BIANNUAL' : 'ANNUAL'
  }

  for (const f of ['periodFrom', 'periodTo', 'completedOn', 'incrementWef',
    'promotedWef', 'transferredWef'] as const) {
    if (f in body) data[f] = date(body[f])
  }

  for (const f of ['appraiserId', 'reviewerId'] as const) {
    if (f in body) data[f] = typeof body[f] === 'string' && body[f] ? body[f] : null
  }

  // Signatures are stamped, never typed — the moment of signing is the record.
  if (body.signAppraiser === true) data.appraiserSignedAt = new Date()
  if (body.signAppraiser === false) data.appraiserSignedAt = null
  if (body.signReviewer === true) data.reviewerSignedAt = new Date()
  if (body.signReviewer === false) data.reviewerSignedAt = null
  if (body.signHr === true && isHr) {
    data.hrSignedAt = new Date()
    data.hrSignedById = payload.userId
  }
  if (body.signHr === false && isHr) {
    data.hrSignedAt = null
    data.hrSignedById = null
  }

  if (typeof body.status === 'string' && STATUSES.has(body.status)) {
    data.status = body.status
  }

  const saved = await prisma.appraisalForm.update({
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
  const form = await prisma.appraisalForm.findUnique({
    where: { id }, select: { status: true },
  })
  if (!form) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (form.status === 'FINALISED') {
    return NextResponse.json({
      error: 'A finalised appraisal is a record and cannot be deleted.',
    }, { status: 400 })
  }
  await prisma.appraisalForm.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

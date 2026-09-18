/**
 * /api/recruiting/candidates/[id]/review — evaluations and assessments.
 *
 *   GET                                        both, newest first
 *   POST { type: 'evaluation', stage, ratings, overallRating?, recommendation?, summary? }
 *   POST { type: 'assessment', name, kind, brief?, score?, maxScore?, result?, notes?, link?, sentAt?, completedAt? }
 *   PATCH { type: 'assessment', id, …the same fields }   record how it went
 *   DELETE ?type=evaluation|assessment&rid=…              its author, or HR
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveJobActor } from '@/lib/job-post-server'
import { ASSESSMENT_KINDS, RECOMMENDATIONS } from '@/lib/candidate-review-labels'

type Ctx = { params: Promise<{ id: string }> }

const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const num = (v: unknown) => {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const date = (v: unknown) => {
  if (typeof v !== 'string' || !v) return null
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00+05:00` : v)
  return isNaN(d.getTime()) ? null : d
}

async function author(employeeId: string | null, userId: string) {
  if (employeeId) {
    const e = await prisma.employee.findUnique({ where: { id: employeeId }, select: { fullName: true } })
    if (e) return e.fullName
  }
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  return u?.email ?? 'HR'
}

function assessmentData(b: Record<string, unknown>) {
  return {
    name: text(b.name, 120) ?? 'Assessment',
    kind: ASSESSMENT_KINDS.some((k) => k.key === b.kind) ? String(b.kind) : 'OTHER',
    brief: text(b.brief, 8000),
    score: num(b.score),
    maxScore: num(b.maxScore),
    result: ['PASS', 'BORDERLINE', 'FAIL'].includes(String(b.result)) ? String(b.result) : null,
    notes: text(b.notes, 4000),
    link: text(b.link, 500),
    sentAt: date(b.sentAt),
    completedAt: date(b.completedAt),
  }
}

export async function GET(request: NextRequest, { params }: Ctx) {
  const actor = await resolveJobActor(request)
  if (actor instanceof NextResponse) return actor
  const { id } = await params
  const [evaluations, assessments] = await Promise.all([
    prisma.candidateEvaluation.findMany({ where: { candidateId: id }, orderBy: { createdAt: 'desc' } }),
    prisma.candidateAssessment.findMany({ where: { candidateId: id }, orderBy: { createdAt: 'desc' } }),
  ])
  return NextResponse.json({
    evaluations: evaluations.map((e) => ({ ...e, ratings: (() => { try { return JSON.parse(e.ratings) } catch { return [] } })() })),
    assessments,
  })
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const actor = await resolveJobActor(request)
  if (actor instanceof NextResponse) return actor
  const { id } = await params
  const c = await prisma.candidate.findUnique({ where: { id }, select: { id: true, stage: true } })
  if (!c) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
  const b = await request.json().catch(() => ({})) as Record<string, unknown>
  const name = await author(actor.employeeId, actor.userId)

  if (b.type === 'evaluation') {
    const ratings = (Array.isArray(b.ratings) ? b.ratings : [])
      .map((r) => {
        const o = r && typeof r === 'object' ? r as Record<string, unknown> : {}
        const rating = num(o.rating)
        return {
          competency: String(o.competency ?? '').slice(0, 80),
          question: text(o.question, 300),
          rating: rating != null && rating >= 1 && rating <= 5 ? Math.round(rating) : null,
          note: text(o.note, 2000),
        }
      })
      .filter((r) => r.competency && (r.rating != null || r.note))
      .slice(0, 60)
    const rated = ratings.filter((r) => r.rating != null).map((r) => r.rating as number)
    const overall = num(b.overallRating)
    if (!ratings.length && !text(b.summary, 10)) {
      return NextResponse.json({ error: 'Rate at least one competency or write a summary.' }, { status: 400 })
    }
    const evaluation = await prisma.candidateEvaluation.create({
      data: {
        candidateId: id,
        stage: text(b.stage, 30) ?? c.stage,
        authorUserId: actor.userId,
        authorName: name,
        ratings: JSON.stringify(ratings),
        overallRating: overall != null && overall >= 1 && overall <= 5
          ? overall
          : rated.length ? Math.round((rated.reduce((a, x) => a + x, 0) / rated.length) * 10) / 10 : null,
        recommendation: RECOMMENDATIONS.some((r) => r.key === b.recommendation) ? String(b.recommendation) : null,
        summary: text(b.summary, 4000),
      },
    })
    return NextResponse.json({ evaluation }, { status: 201 })
  }

  if (b.type === 'assessment') {
    const assessment = await prisma.candidateAssessment.create({
      data: { candidateId: id, ...assessmentData(b), recordedById: actor.userId, recordedBy: name },
    })
    return NextResponse.json({ assessment }, { status: 201 })
  }
  return NextResponse.json({ error: 'type must be evaluation or assessment' }, { status: 400 })
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const actor = await resolveJobActor(request)
  if (actor instanceof NextResponse) return actor
  const { id } = await params
  const b = await request.json().catch(() => ({})) as Record<string, unknown>
  if (b.type !== 'assessment' || typeof b.id !== 'string') {
    return NextResponse.json({ error: 'Send the assessment to update.' }, { status: 400 })
  }
  const found = await prisma.candidateAssessment.findFirst({ where: { id: b.id, candidateId: id } })
  if (!found) return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
  const assessment = await prisma.candidateAssessment.update({ where: { id: found.id }, data: assessmentData({ ...found, ...b }) })
  return NextResponse.json({ assessment })
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const actor = await resolveJobActor(request)
  if (actor instanceof NextResponse) return actor
  const { id } = await params
  const type = request.nextUrl.searchParams.get('type')
  const rid = request.nextUrl.searchParams.get('rid') ?? ''
  if (type === 'evaluation') {
    const e = await prisma.candidateEvaluation.findFirst({ where: { id: rid, candidateId: id } })
    if (!e) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!actor.isHR && e.authorUserId !== actor.userId) return NextResponse.json({ error: 'Only its author or HR can remove it' }, { status: 403 })
    await prisma.candidateEvaluation.delete({ where: { id: e.id } })
    return NextResponse.json({ ok: true })
  }
  if (type === 'assessment') {
    const a = await prisma.candidateAssessment.findFirst({ where: { id: rid, candidateId: id } })
    if (!a) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!actor.isHR && a.recordedById !== actor.userId) return NextResponse.json({ error: 'Only whoever recorded it or HR can remove it' }, { status: 403 })
    await prisma.candidateAssessment.delete({ where: { id: a.id } })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'type must be evaluation or assessment' }, { status: 400 })
}

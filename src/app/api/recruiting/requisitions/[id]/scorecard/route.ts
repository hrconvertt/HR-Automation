/**
 * /api/recruiting/requisitions/[id]/scorecard — the job's scorecard.
 *
 *   GET                     the competencies and questions every evaluation uses
 *   POST { action: 'draft' } draw a first draft from the job description and keep it
 *   PUT  { scorecard }       save HR's edits
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveJobActor } from '@/lib/job-post-server'
import { draftScorecard, parseScorecard, sanitizeScorecard } from '@/lib/candidate-evaluation'

export const runtime = 'nodejs'
export const maxDuration = 60

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Ctx) {
  const actor = await resolveJobActor(request)
  if (actor instanceof NextResponse) return actor
  const { id } = await params
  const job = await prisma.jobRequisition.findUnique({ where: { id }, select: { scorecardTemplate: true } })
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  return NextResponse.json({ scorecard: parseScorecard(job.scorecardTemplate) })
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const actor = await resolveJobActor(request)
  if (actor instanceof NextResponse) return actor
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Drafting with AI is not set up on this deployment. Write the competencies yourself.' }, { status: 503 })
  }
  const { id } = await params
  const job = await prisma.jobRequisition.findUnique({
    where: { id },
    select: { title: true, jdContent: true, description: true, requirements: true, minExperienceYears: true },
  })
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  try {
    const scorecard = await draftScorecard(job)
    if (!scorecard.length) return NextResponse.json({ error: 'No scorecard could be drawn from this job description.' }, { status: 422 })
    await prisma.jobRequisition.update({ where: { id }, data: { scorecardTemplate: JSON.stringify(scorecard) } })
    return NextResponse.json({ scorecard })
  } catch (e) {
    console.error('[scorecard draft]', e)
    return NextResponse.json({ error: 'Could not draft the scorecard. Try again.' }, { status: 502 })
  }
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  const actor = await resolveJobActor(request)
  if (actor instanceof NextResponse) return actor
  const { id } = await params
  const body = await request.json().catch(() => ({})) as { scorecard?: unknown }
  const scorecard = sanitizeScorecard(body.scorecard)
  await prisma.jobRequisition.update({
    where: { id },
    data: { scorecardTemplate: scorecard.length ? JSON.stringify(scorecard) : null },
  })
  return NextResponse.json({ scorecard })
}

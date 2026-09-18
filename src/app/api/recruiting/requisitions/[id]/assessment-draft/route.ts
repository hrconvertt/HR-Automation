/**
 * POST /api/recruiting/requisitions/[id]/assessment-draft — a test for this job, written from its description.
 *
 * body: { kind, note? }. Returns { name, brief }; nothing is saved until HR
 * records it against a candidate.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveJobActor } from '@/lib/job-post-server'
import { draftAssessment } from '@/lib/candidate-evaluation'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await resolveJobActor(request)
  if (actor instanceof NextResponse) return actor
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Drafting with AI is not set up on this deployment.' }, { status: 503 })
  }
  const { id } = await params
  const body = await request.json().catch(() => ({})) as { kind?: string; note?: string }
  const job = await prisma.jobRequisition.findUnique({
    where: { id },
    select: { title: true, jdContent: true, description: true, requirements: true, minExperienceYears: true },
  })
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  try {
    const draft = await draftAssessment(job, String(body.kind ?? 'PRACTICAL'), String(body.note ?? '').slice(0, 500))
    return NextResponse.json(draft)
  } catch (e) {
    console.error('[assessment draft]', e)
    return NextResponse.json({ error: 'Could not draft the assessment. Try again.' }, { status: 502 })
  }
}

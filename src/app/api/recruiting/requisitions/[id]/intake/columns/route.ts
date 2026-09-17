/**
 * POST /api/recruiting/requisitions/[id]/intake/columns
 *
 * Screening columns suggested from the role's job description — what this job
 * asks for, as column headers a CV can answer. Suggests only; saving them is
 * the job post route's PUT, as with Edit screening columns.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveJobActor } from '@/lib/job-post-server'
import { parseScreeningColumns } from '@/lib/candidate-tracker'
import { IntakeError, suggestScreeningColumns } from '@/lib/candidate-intake'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await resolveJobActor(request)
  if (actor instanceof NextResponse) return actor
  const { id } = await params
  const job = await prisma.jobRequisition.findUnique({
    where: { id },
    select: { title: true, jdContent: true, description: true, requirements: true, minExperienceYears: true, screeningColumns: true },
  })
  if (!job) return NextResponse.json({ error: 'Requisition not found' }, { status: 404 })
  const existing = parseScreeningColumns(job.screeningColumns)
  if (!job.jdContent && !job.description && !job.requirements) {
    return NextResponse.json({
      existing, suggested: [],
      note: 'This role has no job description yet, so there is nothing to suggest columns from.',
    })
  }
  try {
    const suggested = await suggestScreeningColumns(job, existing)
    return NextResponse.json({ existing, suggested, note: null })
  } catch (e) {
    console.error('[intake columns]', e)
    // A missing key or a failed read is not fatal here: the upload still works
    // with the columns the role already has.
    const status = e instanceof IntakeError && e.status !== 503 ? e.status : 200
    return NextResponse.json(
      { existing, suggested: [], note: e instanceof Error ? e.message : 'Could not suggest columns.' },
      { status },
    )
  }
}

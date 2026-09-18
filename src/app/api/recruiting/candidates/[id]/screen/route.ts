/**
 * POST /api/recruiting/candidates/[id]/screen — match one person against their job.
 *
 * Reads the CV when one was uploaded, otherwise the details already on the
 * record, against the job description: each requirement met, partly met, not
 * met or not stated, with the evidence, and a fit score and verdict that follow
 * from them. The score, verdict and match are replaced; everything else only
 * fills blanks, so nothing HR typed is overwritten. Knockout status is left as
 * it is — re-screening never hides someone from the pipeline on its own.
 */
import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolveJobActor } from '@/lib/job-post-server'
import { parseScreening, parseScreeningColumns } from '@/lib/candidate-tracker'
import {
  IntakeError, aiAvailable, profileText, readAgainstJob, readCv,
} from '@/lib/candidate-intake'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await resolveJobActor(request)
  if (actor instanceof NextResponse) return actor
  if (!aiAvailable()) {
    return NextResponse.json({ error: 'Screening needs AI reading, which is not set up on this deployment.' }, { status: 503 })
  }
  const { id } = await params
  const c = await prisma.candidate.findUnique({
    where: { id },
    include: {
      cvFile: true,
      requisition: {
        select: { title: true, jdContent: true, description: true, requirements: true, minExperienceYears: true, screeningColumns: true },
      },
    },
  })
  if (!c) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
  const job = c.requisition
  if (!job.jdContent && !job.description && !job.requirements) {
    return NextResponse.json({ error: 'This job has no description to screen against yet.' }, { status: 409 })
  }
  const screeningColumns = parseScreeningColumns(job.screeningColumns)

  try {
    let reading
    if (c.cvFile) {
      reading = await readCv({ bytes: Buffer.from(c.cvFile.bytes), filename: c.cvFile.name, mime: c.cvFile.mime, job, screeningColumns })
    } else {
      const text = profileText(c as unknown as Record<string, unknown>)
      if (text.split('\n').length < 3) {
        return NextResponse.json({ error: 'There is too little on this record to screen. Upload their CV.' }, { status: 409 })
      }
      reading = await readAgainstJob({
        block: { type: 'text', text: `=== CANDIDATE DETAILS ===\n${text.slice(0, 20000)}` },
        basis: 'profile', job, screeningColumns,
      })
    }

    const data: Record<string, unknown> = {
      matchScore: reading.matchScore,
      verdict: reading.verdict ?? c.verdict,
      screeningMatch: reading.match ? JSON.stringify(reading.match) : c.screeningMatch,
    }
    const blanks: [keyof typeof c, unknown][] = [
      ['phone', reading.phone], ['location', reading.location], ['currentRole', reading.currentRole],
      ['currentCompany', reading.currentCompany], ['pastCompanies', reading.pastCompanies],
      ['education', reading.education], ['educationLevel', reading.educationLevel],
      ['experienceSummary', reading.experienceSummary], ['evaluation', reading.evaluation],
      ['experience', reading.totalExperienceYears],
      ['skills', reading.skills.length ? JSON.stringify(reading.skills) : null],
    ]
    for (const [k, v] of blanks) if (v != null && (c[k] == null || c[k] === '')) data[k as string] = v
    if ((c.email.endsWith('@no-email.com')) && reading.email) data.email = reading.email.toLowerCase()
    const cells = parseScreening(c.screening)
    let filled = 0
    for (const [k, v] of Object.entries(reading.screening)) if (!cells[k]) { cells[k] = v; filled++ }
    if (filled) data.screening = JSON.stringify(cells)

    await prisma.candidate.update({ where: { id }, data: data as Prisma.CandidateUncheckedUpdateInput })
    return NextResponse.json({ ok: true, matchScore: reading.matchScore, verdict: reading.verdict, basis: reading.match?.basis })
  } catch (e) {
    console.error('[screen candidate]', id, e)
    const status = e instanceof IntakeError ? e.status : 500
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not screen this candidate.' }, { status })
  }
}

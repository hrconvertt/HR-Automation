/**
 * POST /api/recruiting/requisitions/[id]/intake/cv — one CV into the sheet.
 *
 * multipart: file. The browser sends CVs one request each, so a batch of fifty
 * is fifty short reads rather than one request that times out or trips the
 * upload size limit.
 *
 * The CV is read against the job description and filled into the tracker's
 * columns and every screening column the role has. The file is kept and linked
 * from the CV column.
 *
 * Someone already on this role (same email) is not added twice: their blank
 * cells are filled from the CV and anything HR already typed is left as it is.
 */
import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolveJobActor } from '@/lib/job-post-server'
import { parseScreening, parseScreeningColumns } from '@/lib/candidate-tracker'
import { IntakeError, cvKind, readCv } from '@/lib/candidate-intake'

export const runtime = 'nodejs'
export const maxDuration = 120

const MAX_BYTES = 4 * 1024 * 1024

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await resolveJobActor(request)
  if (actor instanceof NextResponse) return actor
  const { id } = await params
  const job = await prisma.jobRequisition.findUnique({
    where: { id },
    select: { title: true, jdContent: true, description: true, requirements: true, minExperienceYears: true, screeningColumns: true },
  })
  if (!job) return NextResponse.json({ error: 'Requisition not found' }, { status: 404 })

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file received.' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'This CV is larger than 4 MB.' }, { status: 400 })
  const mime = file.type || 'application/octet-stream'
  if (!cvKind(file.name, mime)) {
    return NextResponse.json({ error: 'CVs can be PDF, Word (.docx), text, or an image.' }, { status: 400 })
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer())
    const screeningColumns = parseScreeningColumns(job.screeningColumns)
    const cv = await readCv({ bytes, filename: file.name, mime, job, screeningColumns })

    // Knockouts: the job's own minimum years is enforced here, the same way
    // every time, and the reader's hard failures are added to it.
    const failures = [...cv.knockoutFailures]
    const min = job.minExperienceYears
    if (min != null && min > 0 && cv.totalExperienceYears != null && cv.totalExperienceYears < min) {
      failures.push(`Experience below the required minimum: ${cv.totalExperienceYears} years against ${min === 0.5 ? '6 months' : `${min} years`}.`)
    }
    const knockout = cv.readBy === 'ai'
      ? { knockoutStatus: failures.length ? 'FAILED' : 'PASSED', knockoutReasons: failures.length ? JSON.stringify(failures.map((reason) => ({ type: 'CV_READ', reason }))) : null }
      : {}

    const filled = {
      phone: cv.phone, location: cv.location, currentRole: cv.currentRole, currentCompany: cv.currentCompany,
      pastCompanies: cv.pastCompanies, education: cv.education, educationLevel: cv.educationLevel,
      experienceSummary: cv.experienceSummary, experience: cv.totalExperienceYears,
      yearsExperience: cv.totalExperienceYears != null ? Math.floor(cv.totalExperienceYears) : null,
      matchScore: cv.matchScore, verdict: cv.verdict, evaluation: cv.evaluation,
      skills: cv.skills.length ? JSON.stringify(cv.skills) : null,
      screeningMatch: cv.match ? JSON.stringify(cv.match) : null,
    }

    const email = cv.email?.toLowerCase() ?? null
    const existing = email
      ? await prisma.candidate.findFirst({
          where: { requisitionId: id, email: { equals: email, mode: 'insensitive' } },
          include: { cvFile: { select: { id: true } } },
        })
      : null

    if (existing) {
      const data: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(filled)) {
        if (v != null && (existing as Record<string, unknown>)[k] == null) data[k] = v
      }
      const cells = parseScreening(existing.screening)
      let added = 0
      for (const [k, v] of Object.entries(cv.screening)) if (!cells[k]) { cells[k] = v; added++ }
      if (added) data.screening = JSON.stringify(cells)
      if (!existing.cvFile) data.cvUrl = `/api/recruiting/candidates/${existing.id}/cv`
      await prisma.candidate.update({ where: { id: existing.id }, data: data as Prisma.CandidateUncheckedUpdateInput })
      if (!existing.cvFile) {
        await prisma.candidateCvFile.create({ data: { candidateId: existing.id, name: file.name, mime, size: bytes.length, bytes } })
      }
      return NextResponse.json({
        status: 'updated', id: existing.id, fullName: existing.fullName,
        filled: Object.keys(data).filter((k) => k !== 'cvUrl').length, readBy: cv.readBy,
      })
    }

    const created = await prisma.candidate.create({
      data: {
        requisitionId: id,
        fullName: cv.fullName || file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim(),
        email: email ?? `unknown-${Date.now()}@no-email.com`,
        ...filled,
        ...knockout,
        stage: 'APPLIED',
        source: 'CV_UPLOAD',
        screening: Object.keys(cv.screening).length ? JSON.stringify(cv.screening) : null,
        notes: `CV uploaded: ${file.name}`,
      },
      select: { id: true, fullName: true },
    })
    await prisma.candidateCvFile.create({ data: { candidateId: created.id, name: file.name, mime, size: bytes.length, bytes } })
    await prisma.candidate.update({ where: { id: created.id }, data: { cvUrl: `/api/recruiting/candidates/${created.id}/cv` } })

    return NextResponse.json({
      status: 'created', id: created.id, fullName: created.fullName,
      matchScore: cv.matchScore, verdict: cv.verdict, knockedOut: failures.length > 0 && cv.readBy === 'ai',
      readBy: cv.readBy,
    })
  } catch (e) {
    console.error('[intake cv]', file.name, e)
    const status = e instanceof IntakeError ? e.status : 500
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not read this CV.' }, { status })
  }
}

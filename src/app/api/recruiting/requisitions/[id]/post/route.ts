/**
 * /api/recruiting/requisitions/[id]/post — the job post editor's saves.
 *
 *   GET — the job's interview rounds, for Schedule Interview.
 *   PUT — save one step. body: {
 *     job?: the first step's boxes (see readJobFields)
 *     applicationForm?: { fields, questions }
 *     saveFormAsDefault?: boolean   // HR: new jobs start from these fields
 *     interviewRounds?: [{ name, type }]
 *   }
 *
 * Saving the job re-assembles the job description from its sections. A job
 * that is already live stays live — the careers page shows the edit at once,
 * the way editing a published job in Workable does.
 */
import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  canEditJob, readJobFields, resolveJobActor, saveDefaultApplicationFields,
} from '@/lib/job-post-server'
import {
  composeJdContent, parseRounds, sanitizeApplicationForm, sanitizeRounds,
} from '@/lib/job-post'

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: RouteParams) {
  const actor = await resolveJobActor(request)
  if (actor instanceof NextResponse) return actor
  const { id } = await params
  const req = await prisma.jobRequisition.findUnique({ where: { id }, select: { interviewRounds: true } })
  if (!req) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ interviewRounds: parseRounds(req.interviewRounds) })
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const actor = await resolveJobActor(request)
  if (actor instanceof NextResponse) return actor
  const { id } = await params

  const req = await prisma.jobRequisition.findUnique({
    where: { id },
    select: { id: true, status: true, requestedById: true, jdStatus: true },
  })
  if (!req) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canEditJob(actor, req)) {
    return NextResponse.json(
      { error: 'You can edit a job you raised while it is a draft or waiting for HR.' },
      { status: 403 },
    )
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const data: Prisma.JobRequisitionUncheckedUpdateInput = {}

  if (body.job !== undefined) {
    const read = readJobFields(body.job)
    if ('error' in read) return NextResponse.json({ error: read.error }, { status: 400 })
    const f = read.fields
    const dept = f.departmentId
      ? await prisma.department.findUnique({ where: { id: f.departmentId }, select: { name: true } })
      : null
    Object.assign(data, {
      title: f.title,
      departmentId: f.departmentId,
      positionLevel: f.positionLevel,
      type: f.type,
      vacancies: f.vacancies,
      location: f.location,
      isRemote: f.isRemote,
      internalCode: f.internalCode,
      minExperienceYears: f.minExperienceYears,
      educationLevel: f.educationLevel,
      salaryMin: f.salaryMin,
      salaryMax: f.salaryMax,
      salaryCurrency: f.salaryCurrency,
      closingDate: f.closingDate,
      jdSections: JSON.stringify(f.sections),
      jdContent: composeJdContent({ ...f, departmentName: dept?.name }, f.sections),
      // Scoring and the workspace read these two columns directly.
      description: f.sections.summary || null,
      requirements: f.sections.requirements.join('\n') || null,
      jdStatus: req.jdStatus === 'POSTED' ? 'POSTED' : 'DRAFT_JD',
      jdGeneratedAt: new Date(),
    } satisfies Prisma.JobRequisitionUncheckedUpdateInput)
  }

  if (body.applicationForm !== undefined) {
    const form = sanitizeApplicationForm(body.applicationForm)
    data.applicationForm = JSON.stringify(form)
    if (body.saveFormAsDefault === true && actor.isHR) await saveDefaultApplicationFields(form.fields)
  }

  if (body.interviewRounds !== undefined) {
    data.interviewRounds = JSON.stringify(sanitizeRounds(body.interviewRounds))
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to save' }, { status: 400 })
  }
  await prisma.jobRequisition.update({ where: { id }, data })
  return NextResponse.json({ ok: true })
}

/**
 * POST /api/careers/[id]/apply — public, unauthenticated.
 *
 *   Accepts a candidate application from the public careers page.
 *   Validates the job is POSTED + OPEN; refuses everything else.
 *   Creates a Candidate row in stage='APPLIED' with source tagged.
 *
 *   The job's own application form decides what is kept: a field switched
 *   off is dropped even if a stale page sends it, a mandatory one has to be
 *   filled, and the job's questions are answered and stored.
 *
 *   Rate-limit lives at the platform layer (Vercel) — within the app
 *   we just guard against duplicate emails per job.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { scoreCandidate } from '@/lib/candidate-scoring'
import { evaluateCriteria } from '@/lib/knockout-evaluator'
import { triggerEmail, candidateVars } from '@/lib/email-triggers'
import { APPLICATION_FIELDS, parseApplicationForm, type ApplicationFieldKey } from '@/lib/job-post'

const VALID_EDUCATION = new Set(['HIGH_SCHOOL', 'DIPLOMA', 'BACHELORS', 'MASTERS', 'PHD'])

function toJsonArray(input: unknown): string | null {
  if (input == null) return null
  let arr: string[] = []
  if (Array.isArray(input)) {
    arr = input.map((x) => String(x).trim()).filter(Boolean)
  } else if (typeof input === 'string') {
    arr = input.split(',').map((s) => s.trim()).filter(Boolean)
  }
  if (arr.length === 0) return null
  return JSON.stringify(arr.slice(0, 30).map((s) => s.slice(0, 80)))
}

interface RouteParams { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const body = await request.json()

  const fullName       = String(body.fullName || '').trim().slice(0, 200)
  const email          = String(body.email || '').trim().toLowerCase().slice(0, 200)
  const sourceRaw      = body.source ? String(body.source).toUpperCase() : 'CAREERS_PAGE'
  const VALID_SOURCES  = new Set(['LINKEDIN', 'REFERRAL', 'PORTAL', 'WALK_IN', 'CAREERS_PAGE', 'OTHER'])
  const source         = VALID_SOURCES.has(sourceRaw) ? sourceRaw : 'CAREERS_PAGE'

  const experienceRaw  = body.experience != null && body.experience !== '' ? Number(body.experience) : null
  const experience     = experienceRaw != null && Number.isFinite(experienceRaw) && experienceRaw >= 0
    ? Math.min(50, experienceRaw)
    : null
  const yearsExpRaw    = body.yearsExperience != null && body.yearsExperience !== '' ? Number(body.yearsExperience) : null
  const educationRaw   = body.educationLevel ? String(body.educationLevel).toUpperCase().trim() : null
  const salaryRaw      = body.expectedSalary != null && body.expectedSalary !== '' ? Number(body.expectedSalary) : null

  // Everything the form can ask, read from the body. What the job's form keeps
  // is decided below, once the job is known.
  const sent: Record<ApplicationFieldKey, string | number | boolean | null> = {
    phone:             body.phone ? String(body.phone).trim().slice(0, 50) : null,
    location:          body.location ? String(body.location).trim().slice(0, 120) : null,
    currentCompany:    body.currentCompany ? String(body.currentCompany).trim().slice(0, 200) : null,
    currentRole:       body.currentRole ? String(body.currentRole).trim().slice(0, 200) : null,
    experience,
    educationLevel:    educationRaw && VALID_EDUCATION.has(educationRaw) ? educationRaw : null,
    cvUrl:             body.cvUrl ? String(body.cvUrl).trim().slice(0, 500) : null,
    skills:            toJsonArray(body.skills),
    languages:         toJsonArray(body.languages),
    workAuthorization: body.workAuthorization ? String(body.workAuthorization).trim().toUpperCase().slice(0, 10) : null,
    openToRemote:      body.openToRemote === true || body.openToRemote === 'true',
    expectedSalary:    salaryRaw != null && Number.isFinite(salaryRaw) && salaryRaw >= 0 ? salaryRaw : null,
    noticePeriod:      body.noticePeriod ? String(body.noticePeriod).trim().slice(0, 80) : null,
    notes:             body.notes ? String(body.notes).trim().slice(0, 2000) : null,
  }

  // Basic validation — strict enough to keep junk out, lenient enough
  // to not block real applicants.
  if (!fullName || fullName.length < 2) {
    return NextResponse.json({ error: 'Please enter your full name' }, { status: 400 })
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  }

  const job = await prisma.jobRequisition.findUnique({
    where: { id },
    select: {
      id: true, title: true, type: true, status: true, jdStatus: true, jdContent: true,
      applicationForm: true,
    },
  })
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  if (job.status !== 'OPEN' || job.jdStatus !== 'POSTED') {
    return NextResponse.json({ error: 'This role is no longer accepting applications.' }, { status: 410 })
  }

  const form = parseApplicationForm(job.applicationForm)
  for (const f of APPLICATION_FIELDS) {
    const v = sent[f.key]
    if (form.fields[f.key] === 'MANDATORY' && (v == null || v === '' || v === false)) {
      return NextResponse.json({ error: `Please fill in ${f.label.toLowerCase()}.` }, { status: 400 })
    }
  }
  const kept = <K extends ApplicationFieldKey>(k: K) => (form.fields[k] === 'OFF' ? null : sent[k])

  const rawAnswers = body.answers && typeof body.answers === 'object' ? body.answers as Record<string, unknown> : {}
  const answers: { id: string; question: string; answer: string }[] = []
  for (const q of form.questions) {
    const a = String(rawAnswers[q.id] ?? '').trim().slice(0, 1000)
    if (!a) {
      if (q.required) return NextResponse.json({ error: `Please answer: ${q.text}` }, { status: 400 })
      continue
    }
    if (q.type === 'NUMBER' && !Number.isFinite(Number(a))) {
      return NextResponse.json({ error: `"${q.text}" needs a number.` }, { status: 400 })
    }
    if (q.type === 'YES_NO' && a !== 'Yes' && a !== 'No') {
      return NextResponse.json({ error: `Answer "${q.text}" with yes or no.` }, { status: 400 })
    }
    answers.push({ id: q.id, question: q.text, answer: a })
  }

  const phone = kept('phone') as string | null
  const location = kept('location') as string | null
  const currentCompany = kept('currentCompany') as string | null
  const currentRole = kept('currentRole') as string | null
  const keptExperience = kept('experience') as number | null
  const educationLevel = kept('educationLevel') as string | null
  const cvUrl = kept('cvUrl') as string | null
  const skills = kept('skills') as string | null
  const languages = kept('languages') as string | null
  const workAuthorization = kept('workAuthorization') as string | null
  const openToRemote = kept('openToRemote') === true
  const notes = kept('notes') as string | null
  const yearsExperience = form.fields.experience === 'OFF'
    ? null
    : yearsExpRaw != null && Number.isFinite(yearsExpRaw) && yearsExpRaw >= 0
      ? Math.min(60, Math.floor(yearsExpRaw))
      : (keptExperience != null ? Math.floor(keptExperience) : null)

  // Idempotency: same email + same requisition → reject duplicate
  const existing = await prisma.candidate.findFirst({
    where: { requisitionId: id, email },
    select: { id: true },
  })
  if (existing) {
    return NextResponse.json({
      ok: true,
      duplicate: true,
      message: "You've already applied for this role — we'll be in touch.",
    })
  }

  // ─── Workday-style "gate before score" ────────────────────────────
  // Load criteria + evaluate BEFORE scoring. If hard filters fail, skip
  // the AI score entirely (saves CPU + keeps the kanban clean).
  const criteria = await prisma.knockoutCriterion.findMany({
    where: { requisitionId: id },
    select: { type: true, value: true, isHard: true },
  })
  const knockout = evaluateCriteria(
    {
      workAuthorization,
      location,
      openToRemote,
      skills,
      languages,
      yearsExperience,
      experience: keptExperience,
      educationLevel,
    },
    criteria,
  )
  // No criteria defined → backwards-compatible: everyone passes & gets scored.
  const passed = criteria.length === 0 ? true : knockout.passed
  const knockoutStatus = passed ? 'PASSED' : 'FAILED'

  let score: number | null = null
  let scoreReason: string | null = null
  if (passed) {
    const result = scoreCandidate(
      { experience: keptExperience, currentCompany, currentRole, source, notes, cvUrl, fullName },
      { title: job.title, type: job.type, jdContent: job.jdContent },
    )
    score = result.score
    scoreReason = result.reason
  }

  const newCandidate = await prisma.candidate.create({
    data: {
      requisitionId: id,
      fullName, email, phone,
      currentCompany, currentRole,
      experience: keptExperience,
      cvUrl,
      notes,
      source,
      stage: 'APPLIED',
      matchScore: score,
      scoreReason,
      // Knockout fields
      knockoutStatus,
      knockoutReasons: passed ? null : JSON.stringify(knockout.failures),
      workAuthorization,
      yearsExperience,
      educationLevel,
      location,
      openToRemote,
      skills,
      languages,
      expectedSalary: kept('expectedSalary') != null ? String(kept('expectedSalary')) : null,
      noticePeriod: kept('noticePeriod') as string | null,
      answers: answers.length ? JSON.stringify(answers) : null,
    },
  })

  // Trigger acknowledgment email (REC-01)
  await triggerEmail({
    event: 'application.received',
    candidateId: newCandidate.id,
    variables: { ...candidateVars({ fullName, jobTitle: job.title }) },
    conditionContext: { stage: 'applied' },
  })

  return NextResponse.json({
    ok: true,
    message: "Thanks for applying. Shortlisted candidates hear back within 7 working days.",
  })
}

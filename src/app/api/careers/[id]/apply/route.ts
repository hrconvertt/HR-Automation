/**
 * POST /api/careers/[id]/apply — public, unauthenticated.
 *
 *   Accepts a candidate application from the public careers page.
 *   Validates the job is POSTED + OPEN; refuses everything else.
 *   Creates a Candidate row in stage='APPLIED' with source tagged.
 *
 *   Rate-limit lives at the platform layer (Vercel) — within the app
 *   we just guard against duplicate emails per job.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { scoreCandidate } from '@/lib/candidate-scoring'
import { evaluateCriteria } from '@/lib/knockout-evaluator'
import { triggerEmail, candidateVars } from '@/lib/email-triggers'

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
  const phone          = body.phone ? String(body.phone).trim().slice(0, 50) : null
  const currentCompany = body.currentCompany ? String(body.currentCompany).trim().slice(0, 200) : null
  const currentRole    = body.currentRole ? String(body.currentRole).trim().slice(0, 200) : null
  const experienceRaw  = body.experience != null ? Number(body.experience) : null
  const experience     = experienceRaw != null && Number.isFinite(experienceRaw) && experienceRaw >= 0
    ? Math.min(50, experienceRaw)
    : null
  const cvUrl          = body.cvUrl ? String(body.cvUrl).trim().slice(0, 500) : null
  const notes          = body.notes ? String(body.notes).trim().slice(0, 2000) : null
  const sourceRaw      = body.source ? String(body.source).toUpperCase() : 'CAREERS_PAGE'
  const VALID_SOURCES  = new Set(['LINKEDIN', 'REFERRAL', 'PORTAL', 'WALK_IN', 'CAREERS_PAGE', 'OTHER'])
  const source         = VALID_SOURCES.has(sourceRaw) ? sourceRaw : 'CAREERS_PAGE'

  // ─── Knockout filter inputs ──────────────────────────────────────
  const workAuthorization = body.workAuthorization ? String(body.workAuthorization).trim().toUpperCase().slice(0, 10) : null
  const yearsExpRaw       = body.yearsExperience != null ? Number(body.yearsExperience) : null
  const yearsExperience   = yearsExpRaw != null && Number.isFinite(yearsExpRaw) && yearsExpRaw >= 0
    ? Math.min(60, Math.floor(yearsExpRaw))
    : (experience != null ? Math.floor(experience) : null)
  const educationRaw      = body.educationLevel ? String(body.educationLevel).toUpperCase().trim() : null
  const educationLevel    = educationRaw && VALID_EDUCATION.has(educationRaw) ? educationRaw : null
  const location          = body.location ? String(body.location).trim().slice(0, 120) : null
  const openToRemote      = body.openToRemote === true || body.openToRemote === 'true'
  const skills            = toJsonArray(body.skills)
  const languages         = toJsonArray(body.languages)

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
    select: { id: true, title: true, type: true, status: true, jdStatus: true, jdContent: true },
  })
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  if (job.status !== 'OPEN' || job.jdStatus !== 'POSTED') {
    return NextResponse.json({ error: 'This role is no longer accepting applications.' }, { status: 410 })
  }

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
      experience,
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
      { experience, currentCompany, currentRole, source, notes, cvUrl, fullName },
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
      experience,
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

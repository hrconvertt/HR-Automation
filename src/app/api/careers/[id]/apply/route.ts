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

  // Phase C — auto-score the applicant right at intake.
  const { score, reason } = scoreCandidate(
    { experience, currentCompany, currentRole, source, notes, cvUrl, fullName },
    { title: job.title, type: job.type, jdContent: job.jdContent },
  )

  await prisma.candidate.create({
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
      scoreReason: reason,
    },
  })

  return NextResponse.json({
    ok: true,
    message: "Thanks for applying. Shortlisted candidates hear back within 7 working days.",
  })
}

/**
 * POST /api/recruiting/offers
 *
 *   Creates a JobOffer for a candidate AND drafts an offer-letter email
 *   in the Email Queue (status=DRAFT so HR reviews before sending).
 *   Also advances candidate.stage â†’ 'OFFER' if not already there.
 *
 *   HR_ADMIN or MANAGER. Preview mode: HR-as-Manager allowed (same as
 *   the Hiring Request flow); other previews blocked.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { triggerEmail, candidateVars } from '@/lib/email-triggers'

function escapeHtml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
  } as Record<string, string>)[c])
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true },
  })
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const previewRole = request.cookies.get('hr_preview_role')?.value
  const effectiveRole = (previewRole && me.role === 'HR_ADMIN') ? previewRole : me.role
  if (!['HR_ADMIN', 'MANAGER'].includes(effectiveRole)) {
    return NextResponse.json({ error: 'Only HR or Managers can create offers' }, { status: 403 })
  }

  const body = await request.json()
  const candidateId = String(body.candidateId || '')
  const salaryRaw   = Number(body.salary)
  const joiningRaw  = body.joiningDate ? new Date(body.joiningDate) : null
  const expiryRaw   = body.expiryDate ? new Date(body.expiryDate) : null
  const note        = body.note ? String(body.note).trim().slice(0, 2000) : null

  if (!candidateId) return NextResponse.json({ error: 'candidateId is required' }, { status: 400 })
  if (!Number.isFinite(salaryRaw) || salaryRaw <= 0) return NextResponse.json({ error: 'Salary must be a positive number' }, { status: 400 })

  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    include: { requisition: { select: { title: true, type: true } } },
  })
  if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })

  // Idempotency: candidateId is @@unique on JobOffer, so upsert.
  const offer = await prisma.jobOffer.upsert({
    where: { candidateId },
    update: {
      salary: salaryRaw,
      joiningDate: joiningRaw,
      expiryDate: expiryRaw,
      status: 'PENDING',
    },
    create: {
      candidateId,
      offerDate: new Date(),
      salary: salaryRaw,
      joiningDate: joiningRaw,
      expiryDate: expiryRaw,
      status: 'PENDING',
    },
  })

  // Move candidate to OFFER stage.
  if (candidate.stage !== 'OFFER' && candidate.stage !== 'HIRED' && candidate.stage !== 'REJECTED') {
    await prisma.candidate.update({ where: { id: candidateId }, data: { stage: 'OFFER' } })
  }

  // Draft the offer-letter email.
  const firstName = candidate.fullName.split(' ')[0]
  const joiningLine = joiningRaw
    ? joiningRaw.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : 'a date to be confirmed during your reply'
  const expiryLine = expiryRaw
    ? expiryRaw.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : '7 days from the date of this email'
  const salaryPkr = `PKR ${Math.round(salaryRaw).toLocaleString()}/month`

  const subject = `Offer of Employment â€” ${candidate.requisition?.title ?? 'Convertt'}`
  const bodyHtml = `
<p>Dear ${escapeHtml(firstName)},</p>
<p>Following your interviews, we're delighted to extend an offer to join <strong>Convertt</strong> as <strong>${escapeHtml(candidate.requisition?.title ?? 'Team Member')}</strong>.</p>
<p><strong>Compensation:</strong> ${escapeHtml(salaryPkr)} (gross)<br/>
<strong>Joining Date:</strong> ${escapeHtml(joiningLine)}<br/>
<strong>Offer Valid Until:</strong> ${escapeHtml(expiryLine)}<br/>
<strong>Location:</strong> Mega Tower, Main Boulevard Gulberg, Lahore (On-Site)</p>
${note ? `<p>${escapeHtml(note)}</p>` : ''}
<p>The detailed terms â€” probation, leave entitlements, statutory deductions, etc. â€” are in the attached Employment Agreement. Please review and reply with your acceptance or any questions.</p>
<p>We're excited about what you'll build with us.</p>
<p>Warm regards,<br/>Convertt HR</p>
`.trim()

  const triggerType = candidate.requisition?.type === 'INTERNSHIP' ? 'OFFER_INTERN' : 'OFFER_PERMANENT'
  await prisma.emailDraft.create({
    data: {
      toEmail: candidate.email,
      toName: candidate.fullName,
      subject,
      bodyHtml,
      trigger: triggerType,
      triggerRefId: candidate.id,
      status: 'DRAFT',
      createdById: me.id,
    },
  })

  // Trigger template-driven offer-created email (REC-09)
  await triggerEmail({
    event: 'offer.created',
    candidateId,
    variables: {
      ...candidateVars({ fullName: candidate.fullName, jobTitle: candidate.requisition?.title }),
      'Compensation': salaryPkr,
      'Joining Date': joiningLine,
      'Offer Valid Until': expiryLine,
    },
    createdById: me.id,
    dedupeSalt: offer.id,
  })

  return NextResponse.json({ ok: true, offer, emailDrafted: true })
}

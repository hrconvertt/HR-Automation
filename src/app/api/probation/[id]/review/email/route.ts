/**
 * POST /api/probation/[id]/review/email
 *
 * The letter the review produces. Returns a DRAFT — subject, recipients, body —
 * rather than sending, because the last paragraph is always specific to the
 * person and no template knows it.
 *
 * What goes in it is the argument, not just the outcome. Muzaffar wrote in
 * because he was rated exceptional and offered 12%, and nothing he received
 * told him how the number was reached. So the letter states the rating, the
 * band that rating earns under the 10-15% policy, the percentage chosen, and
 * the figures either side of it. Someone reading it can check the arithmetic,
 * which is the whole point.
 *
 *   Body: { send?: boolean, extraNote?: string, subject?: string, body?: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { sendEmail } from '@/lib/email'
import { ASSESSMENTS, INCREMENT_BRACKETS, DIMENSIONS, RATING_SCALE } from '@/lib/probation-review'

const money = (n: number) => 'PKR ' + Math.round(n).toLocaleString('en-PK')
const longDate = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

const STYLE = 'margin:0 0 14px;font-family:Calibri,Segoe UI,Helvetica,Arial,sans-serif;'
  + 'font-size:15px;line-height:1.7;color:#1e293b;'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Forbidden — HR only' }, { status: 403 })
  }

  let body: { send?: boolean; extraNote?: string; subject?: string; body?: string } = {}
  try { body = await request.json() } catch { /* draft with defaults */ }

  const rec = await prisma.probationRecord.findFirst({
    where: { OR: [{ id }, { employeeId: id }] },
    include: {
      employee: {
        select: {
          id: true, fullName: true, email: true, designation: true,
          joiningDate: true,
          department: { select: { name: true } },
          reportingManager: { select: { fullName: true } },
        },
      },
    },
  })
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const review = await prisma.probationReview.findFirst({
    where: { probationId: rec.id }, orderBy: { createdAt: 'desc' },
  })
  if (!review) {
    return NextResponse.json({
      error: 'Fill in the review first — the letter is written from it.',
    }, { status: 400 })
  }

  const e = rec.employee
  const assessment = review.overallAssessment
  const label = ASSESSMENTS.find((a) => a.value === assessment)?.label ?? '—'
  const bracket = assessment ? INCREMENT_BRACKETS[assessment] : null
  const pct = review.recommendedPct ?? 0
  const current = review.currentSalary ?? 0
  const amount = review.incrementAmount ?? 0
  const proposed = review.proposedSalary ?? 0
  const effective = review.salaryEffectiveFrom ?? rec.endDate

  const ratings = DIMENSIONS.map((dim) => {
    const v = review[`rating${dim.key}` as keyof typeof review] as number | null
    const note = review[`notes${dim.key}` as keyof typeof review] as string | null
    const scale = RATING_SCALE.find((r) => r.value === v)?.label
    return v ? `${dim.label} — ${v}/4 (${scale})${note ? `: ${note}` : ''}` : null
  }).filter(Boolean) as string[]

  const confirming = review.decision === 'CONFIRM'
  const extending = review.decision === 'EXTEND'

  const subject = body.subject?.trim() || (
    confirming ? `Confirmation of Employment & Salary Revision — ${e.fullName}`
    : extending ? `Probation Review Outcome — ${e.fullName}`
    : `Probation Review Outcome — ${e.fullName}`
  )

  const first = e.fullName.split(' ')[0]
  const reviewer = e.reportingManager?.fullName ?? 'your manager'

  const reLine =
    confirming ? 'Re: Confirmation of Employment Following Probation'
    : extending ? 'Re: Probation Review Outcome — Extension of Probation'
    : 'Re: Probation Review Outcome'

  // Overall assessment and the per-dimension ratings, gathered under one heading.
  const summaryBullets = [
    assessment ? `Overall assessment: <strong>${label}</strong>` : null,
    `Reviewed by: ${reviewer}`,
    ...ratings,
  ].filter(Boolean) as string[]

  const paragraphs: (string | null)[] = [
    `Dear ${first},`,

    `<strong>${reLine}</strong>`,

    confirming
      ? `We are pleased to inform you that, following the successful completion and review of your probationary period, your employment with Convertt is hereby confirmed in the position of <strong>${e.designation ?? 'a member of the team'}</strong>${e.department?.name ? `, ${e.department.name}` : ''}, with effect from <strong>${longDate(rec.endDate)}</strong>.`
      : extending
        ? `Following the review of your probationary period, your probation has been extended by <strong>${review.extensionDays ?? 30} days</strong> to allow for further assessment against the areas set out below.`
        : `This letter confirms the outcome of the review of your probationary period.`,

    summaryBullets.length
      ? `<strong>Summary of Review</strong><br>&bull; ${summaryBullets.join('<br>&bull; ')}`
      : null,

    // The manager's note, framed as an attributed quote rather than dropped in
    // as a bare sentence — so a one-line remark still reads deliberately.
    review.managerRemarks?.trim()
      ? `<strong>Reviewer's Remarks</strong><br>"${review.managerRemarks.trim().replace(/\n/g, '<br>')}"`
      : null,

    // The arithmetic, stated. This is the part that was missing when someone
    // was told "exceptional" and handed a mid-bracket number.
    confirming && pct > 0 && current > 0
      ? `<strong>Salary Revision</strong><br>`
        + `In line with Convertt's policy of reviewing compensation at the end of probation within a 10%–15% band`
        + `${bracket ? ` (a rating of ${label} falls in the ${bracket.label} band)` : ''}, `
        + `your monthly salary has been revised by <strong>${pct}%</strong> as follows:`
        + `<br>&bull; Current monthly salary: ${money(current)}`
        + `<br>&bull; Increment: ${money(amount)}`
        + `<br>&bull; Revised monthly salary: <strong>${money(proposed)}</strong>`
        + `<br>&bull; Effective from: ${longDate(effective)}`
      : null,

    extending && review.improvementAreas?.trim()
      ? `<strong>Areas of Focus During the Extension</strong><br>${review.improvementAreas.trim().replace(/\n/g, '<br>')}`
      : null,

    body.extraNote?.trim() || null,

    confirming
      ? 'On behalf of Convertt, thank you for your contribution during your probationary period. We are glad to have you on the team and look forward to your continued growth with us.'
      : extending
        ? 'A further review will be conducted at the end of the extension period, and your manager will discuss the specific expectations with you.'
        : null,

    'Yours sincerely,',
    'Human Resources<br>Convertt',
  ]

  const lines = paragraphs.filter(Boolean) as string[]
  const html = body.body?.trim()
    ? `<div style="max-width:640px">` + body.body.trim().split(/\n{2,}/)
        .map((pp) => `<p style="${STYLE}">${pp.replace(/\n/g, '<br>')}</p>`).join('\n') + '</div>'
    : `<div style="max-width:640px">\n`
        + lines.map((l) => `<p style="${STYLE}">${l}</p>`).join('\n') + '\n</div>'
  const text = body.body?.trim()
    || lines.map((l) => l.replace(/<br>/g, '\n').replace(/<\/?strong>/g, '').replace(/&bull;/g, '•')).join('\n\n')

  if (!body.send) {
    return NextResponse.json({
      draft: true, subject, html, text,
      recipient: e.email,
      manager: e.reportingManager?.fullName ?? null,
      complete: Boolean(assessment && review.decision),
    })
  }

  if (!e.email) {
    return NextResponse.json({ error: 'No email address on file for this employee.' }, { status: 400 })
  }
  const res = await sendEmail({ to: e.email, subject, html, text })
  return NextResponse.json({
    draft: false,
    sent: res.ok && res.transport !== 'queued',
    queued: res.transport === 'queued',
    to: e.email,
  })
}

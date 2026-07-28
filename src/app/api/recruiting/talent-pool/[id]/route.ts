/**
 * Talent Pool endpoints (per-candidate).
 *
 *   PUT    /api/recruiting/talent-pool/[id]   — toggle / update pool status
 *     body: { inPool: boolean, tags?: string, reason?: string }
 *
 *   POST   /api/recruiting/talent-pool/[id]   — invite to active role
 *     body: { requisitionId: string, message?: string }
 *     - Sets candidate.requisitionId + stage='INTERVIEW' (skip APPLIED since vetted)
 *     - Drafts a re-engagement email in the Email Queue
 *     - Removes from pool (they're now active again)
 *
 * HR_ADMIN or MANAGER. Preview blocked for non-HR roles.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

interface RouteParams { params: Promise<{ id: string }> }

function escapeHtml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
  } as Record<string, string>)[c])
}

async function gate(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const me = await prisma.user.findUnique({ where: { id: payload.userId }, select: { id: true, role: true } })
  if (!me) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const previewRole = request.cookies.get('hr_preview_role')?.value
  const effectiveRole = (previewRole && me.role === 'HR_ADMIN') ? previewRole : me.role
  if (!['HR_ADMIN', 'MANAGER'].includes(effectiveRole)) {
    return { error: NextResponse.json({ error: 'Only HR or Managers can manage the talent pool' }, { status: 403 }) }
  }
  return { me }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { me, error } = await gate(request)
  if (error) return error
  const { id } = await params
  const body = await request.json()
  const inPool = !!body.inPool
  const tags   = body.tags ? String(body.tags).trim() : null
  const reason = body.reason ? String(body.reason).trim().slice(0, 1000) : null

  const c = await prisma.candidate.findUnique({ where: { id }, select: { id: true } })
  if (!c) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })

  await prisma.candidate.update({
    where: { id },
    data: {
      inTalentPool: inPool,
      poolTags: inPool ? tags : null,
      poolReason: inPool ? (reason ?? `Manually added by HR (${me!.id.slice(-6)})`) : null,
      poolAddedAt: inPool ? new Date() : null,
    },
  })
  return NextResponse.json({ ok: true })
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { me, error } = await gate(request)
  if (error) return error
  const { id } = await params
  const body = await request.json()
  const requisitionId = String(body.requisitionId || '')
  const customMessage = body.message ? String(body.message).trim().slice(0, 2000) : null
  if (!requisitionId) return NextResponse.json({ error: 'requisitionId is required' }, { status: 400 })

  const [candidate, req] = await Promise.all([
    prisma.candidate.findUnique({
      where: { id },
      include: { requisition: { select: { title: true } } },
    }),
    prisma.jobRequisition.findUnique({
      where: { id: requisitionId },
      select: { id: true, title: true, type: true, status: true },
    }),
  ])
  if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
  if (!req)       return NextResponse.json({ error: 'Requisition not found' }, { status: 404 })
  if (req.status !== 'OPEN') return NextResponse.json({ error: 'Requisition is not open' }, { status: 409 })

  // Skip APPLIED — they were vetted before. Drop them into INTERVIEW
  // so HR remembers to schedule a call.
  await prisma.candidate.update({
    where: { id },
    data: {
      requisitionId,
      stage: 'INTERVIEW',
      inTalentPool: false, // they're active again
      poolAddedAt: null,
    },
  })

  // Draft the re-engagement email.
  const firstName = candidate.fullName.split(' ')[0]
  const subject = `An opportunity that might suit you — ${req.title}`
  const bodyHtml = `
<p>Hi ${escapeHtml(firstName)},</p>
<p>We met during the hiring process for <strong>${escapeHtml(candidate.requisition?.title ?? 'a previous role')}</strong>, and we kept your details on file because we wanted to stay in touch.</p>
<p>An opportunity has just opened up that I think could be a strong fit for you: <strong>${escapeHtml(req.title)}</strong> at Convertt.</p>
${customMessage ? `<p>${escapeHtml(customMessage)}</p>` : ''}
<p>If you're open to a conversation, reply to this email and I'll set up a quick call this week. If your situation has changed and now isn't the right time, no hard feelings — let me know and I'll keep you in mind for future roles.</p>
<p>Warm regards,<br/>Convertt HR</p>
`.trim()

  await prisma.emailDraft.create({
    data: {
      toEmail: candidate.email,
      toName: candidate.fullName,
      subject,
      bodyHtml,
      trigger: 'CUSTOM',
      triggerRefId: candidate.id,
      status: 'DRAFT',
      createdById: me!.id,
    },
  })

  return NextResponse.json({ ok: true, emailDrafted: true })
}

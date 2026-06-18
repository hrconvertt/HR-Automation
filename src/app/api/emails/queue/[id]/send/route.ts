import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'
import { sendEmail } from '@/lib/email'

interface RouteParams { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view to send emails' }, { status: 403 })
  }

  const { id } = await params
  const draft = await prisma.emailDraft.findUnique({ where: { id } })
  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (draft.status === 'SENT') return NextResponse.json({ error: 'Already sent' }, { status: 409 })

  // Mark approved + attempt send
  await prisma.emailDraft.update({
    where: { id },
    data: { status: 'APPROVED', approvedById: payload.userId, approvedAt: new Date() },
  })

  const result = await sendEmail({
    to: draft.toEmail,
    subject: draft.subject,
    html: draft.bodyHtml,
  })

  if (result.ok) {
    await prisma.emailDraft.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date(), sendError: null },
    })
    return NextResponse.json({ sent: true, transport: result.transport })
  } else {
    await prisma.emailDraft.update({
      where: { id },
      data: { status: 'FAILED', sendError: result.error ?? 'Unknown send error' },
    })
    return NextResponse.json({ sent: false, error: result.error, transport: result.transport }, { status: 500 })
  }
}

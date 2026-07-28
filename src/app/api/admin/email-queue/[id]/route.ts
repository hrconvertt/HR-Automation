/**
 * PATCH /api/admin/email-queue/[id]
 *   body: { action: 'SEND' | 'RETRY' | 'SUPPRESS' }
 *
 * SEND     — DRAFT or QUEUED → SENT (calls sendEmail)
 * RETRY    — FAILED → SENT  (re-attempt)
 * SUPPRESS — any → SUPPRESSED (cancel)
 */
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { sendEmail } from '@/lib/email'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const c = await cookies()
  const tok = c.get('hr_token')?.value
  const payload = await verifyToken(tok)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = await prisma.user.findUnique({ where: { id: payload.userId }, select: { role: true } })
  if (!me || me.role !== 'HR_ADMIN') return NextResponse.json({ error: 'HR only' }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const action = String(body.action || '').toUpperCase()

  const send = await prisma.emailSend.findUnique({ where: { id } })
  if (!send) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'SUPPRESS') {
    await prisma.emailSend.update({ where: { id }, data: { status: 'SUPPRESSED' } })
    return NextResponse.json({ ok: true, status: 'SUPPRESSED' })
  }

  if (action === 'SEND' || action === 'RETRY') {
    const result = await sendEmail({
      to: send.toEmail,
      subject: send.subject,
      html: send.body.includes('<') ? send.body : `<pre style="white-space:pre-wrap;font-family:inherit">${send.body.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' } as Record<string, string>)[c])}</pre>`,
    })
    if (result.ok) {
      await prisma.emailSend.update({
        where: { id },
        data: { status: 'SENT', sentAt: new Date(), failedReason: null },
      })
      return NextResponse.json({ ok: true, status: 'SENT', transport: result.transport })
    } else {
      await prisma.emailSend.update({
        where: { id },
        data: { status: 'FAILED', failedReason: result.error ?? 'Unknown' },
      })
      return NextResponse.json({ ok: false, error: result.error, status: 'FAILED' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

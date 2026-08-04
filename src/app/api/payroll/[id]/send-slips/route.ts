/**
 * POST /api/payroll/[id]/send-slips
 *
 * Issues salary slips for a payroll run — to the employee's inbox in the app,
 * to their email, or both.
 *
 *   Body: { payslipIds?: string[], channels?: ('app'|'email')[] }
 *
 * With no payslipIds every slip in the run is sent, which is the "Send all"
 * path. Sending marks `sentAt`; re-sending is allowed but reported, so a
 * double-click cannot silently mail somebody twice without it showing.
 *
 * HR only, and refused in preview mode — this leaves the building.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { sendEmail } from '@/lib/email'
import { formatCurrency } from '@/lib/utils'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { id: payload.userId }, select: { role: true },
  })
  if (!me || me.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Forbidden — HR only' }, { status: 403 })
  }
  if (request.cookies.get('hr_preview_role')?.value) {
    return NextResponse.json(
      { error: 'Leave preview mode before sending salary slips.' }, { status: 403 },
    )
  }

  let body: { payslipIds?: string[]; channels?: string[] } = {}
  try { body = await request.json() } catch { /* send-all with defaults */ }
  const channels = body.channels?.length ? body.channels : ['app', 'email']
  const wantsEmail = channels.includes('email')
  const wantsApp = channels.includes('app')

  const run = await prisma.payrollRun.findUnique({
    where: { id }, select: { id: true, month: true, year: true },
  })
  if (!run) return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 })

  const slips = await prisma.payslip.findMany({
    where: {
      payrollRunId: run.id,
      ...(body.payslipIds?.length ? { id: { in: body.payslipIds } } : {}),
    },
    select: {
      id: true, netSalary: true, sentAt: true,
      employee: { select: { id: true, fullName: true, email: true, employeeCode: true } },
    },
  })
  if (!slips.length) return NextResponse.json({ error: 'No payslips to send' }, { status: 400 })

  const period = `${MONTHS[run.month - 1]} ${run.year}`
  const sent: string[] = []
  const failed: { name: string; reason: string }[] = []
  const queued: string[] = []
  const resent: string[] = []

  for (const s of slips) {
    if (s.sentAt) resent.push(s.employee.fullName)

    if (wantsApp) {
      await prisma.notification.create({
        data: {
          employeeId: s.employee.id,
          type: 'PAYSLIP_READY',
          title: `Salary slip — ${period}`,
          message: `Your salary slip for ${period} is available. Net pay ${formatCurrency(s.netSalary)}.`,
          link: `/dashboard/payroll/payslip/${s.id}`,
        },
      })
    }

    if (wantsEmail) {
      if (!s.employee.email) {
        failed.push({ name: s.employee.fullName, reason: 'no email address on file' })
        continue
      }
      // The slip itself is not attached: it is rendered from live data behind
      // the app's own auth, so a link cannot be forwarded to someone who should
      // not see the figures, and a stale PDF can never disagree with the record.
      const res = await sendEmail({
        to: s.employee.email,
        subject: `Salary Slip — ${period}`,
        html: `<p>Dear ${s.employee.fullName},</p>
<p>Your salary slip for <strong>${period}</strong> is now available.</p>
<p>Net pay: <strong>${formatCurrency(s.netSalary)}</strong></p>
<p>You can view and print the full slip by signing in to the HR portal.</p>
<p>Regards,<br>People Operations<br>Convertt Ltd</p>`,
        text: `Dear ${s.employee.fullName},\n\nYour salary slip for ${period} is available. Net pay ${formatCurrency(s.netSalary)}.\n\nSign in to the HR portal to view and print it.\n\nPeople Operations, Convertt Ltd`,
      })
      if (!res.ok) {
        failed.push({ name: s.employee.fullName, reason: res.error ?? 'send failed' })
        continue
      }
      // With no SMTP host configured, sendEmail writes to a queue and still
      // reports ok. That is not delivery, and marking the slip sent on the
      // strength of it is how a slip shows a green tick in an inbox nobody
      // ever received. Count it separately and leave sentAt alone.
      if (res.transport === 'queued') {
        queued.push(s.employee.fullName)
        continue
      }
    }

    await prisma.payslip.update({ where: { id: s.id }, data: { sentAt: new Date() } })
    sent.push(s.employee.fullName)
  }

  return NextResponse.json({
    period,
    channels,
    sent: sent.length,
    resent: resent.length,
    failed,
    queued,
    smtpConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER),
  })
}

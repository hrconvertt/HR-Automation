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
      employee: { select: { id: true, fullName: true, email: true, employeeCode: true,
        bankName: true, bankAccount: true, ibanAccount: true } },
    },
  })
  if (!slips.length) return NextResponse.json({ error: 'No payslips to send' }, { status: 400 })

  const period = `${MONTHS[run.month - 1]} ${run.year}`

  // The payslip email's wording, if HR has configured one. Loaded once rather
  // than per slip — a payroll run sends this to everybody, and the template
  // does not change between the first employee and the last.
  const payslipTemplate = await prisma.emailTemplate.findFirst({
    where: {
      active: true,
      OR: [{ key: 'PAY-01' }, { triggerEvent: { contains: 'payroll.credited' } }],
    },
    select: { subject: true, body: true },
  })

  const sent: string[] = []
  const failed: { name: string; reason: string }[] = []
  const queued: string[] = []
  const resent: string[] = []

  for (const s of slips) {
    if (s.sentAt) resent.push(s.employee.fullName)

    const acct = s.employee.ibanAccount ?? s.employee.bankAccount ?? null

    if (wantsApp) {
      await prisma.notification.create({
        data: {
          employeeId: s.employee.id,
          type: 'PAYSLIP_READY',
          title: `Salary slip — ${period}`,
          // The two questions people actually ask are how much and into which
          // account, so the notification answers both rather than saying a file
          // exists. It lands on My Payslips with the month open — beside last
          // month, which is what anyone checks when a figure surprises them.
          message: `Your salary slip for ${period} is ready. Net pay ${formatCurrency(s.netSalary)}`
            + (s.employee.bankName ? ` to ${s.employee.bankName}` : '')
            + (acct ? ` ending ${acct.slice(-4)}` : '') + '.',
          link: `/dashboard/payroll?slip=${s.id}`,
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
      // Wording comes from the editable template when one is configured, so
      // this email is changed in Settings > Email Templates rather than in
      // code. Falls back to the built-in copy when the template is missing or
      // deactivated — the slips still go out either way.
      const vars: Record<string, string> = {
        'First Name': s.employee.fullName.split(' ')[0],
        'Full Name': s.employee.fullName,
        'Month Year': period,
        amount: formatCurrency(s.netSalary),
        date: new Date().toLocaleDateString('en-GB', { dateStyle: 'long' }),
        'X days': '7 days',
        'Your Name': 'HR Team',
      }
      const fill = (t: string) => t.replace(/\[([^\]]+)\]/g, (m, k: string) => vars[k.trim()] ?? m)

      const subject = payslipTemplate ? fill(payslipTemplate.subject) : `Salary Slip — ${period}`
      const textBody = payslipTemplate
        ? fill(payslipTemplate.body)
        : `Dear ${s.employee.fullName},\n\nYour salary slip for ${period} is available. Net pay ${formatCurrency(s.netSalary)}.\n\nSign in to the HR portal to view and print it.\n\nPeople Operations, Convertt`
      const htmlBody = payslipTemplate
        ? textBody.split(/\n{2,}/).map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`).join('\n')
        : `<p>Dear ${s.employee.fullName},</p>
<p>Your salary slip for <strong>${period}</strong> is now available.</p>
<p>Net pay: <strong>${formatCurrency(s.netSalary)}</strong></p>
<p>You can view and print the full slip by signing in to the HR portal.</p>
<p>Regards,<br>People Operations<br>Convertt</p>`

      const res = await sendEmail({
        to: s.employee.email,
        subject,
        html: htmlBody,
        text: textBody,
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

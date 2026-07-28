/**
 * Email service — provider-agnostic, with graceful degradation.
 *
 * - If `SMTP_HOST` is set, sends via nodemailer (npm i nodemailer when ready)
 * - Otherwise, queues to the `EmailQueue` config table for later delivery and
 *   logs to the server console. This way the system can be built and tested
 *   without an SMTP credential.
 *
 * Public API:
 *   sendEmail({ to, subject, html, text }) → Promise<{ ok, transport }>
 */

import { prisma } from '@/lib/prisma'

type EmailArgs = {
  to: string
  subject: string
  html: string
  text?: string
}

type EmailResult = {
  ok: boolean
  transport: 'smtp' | 'queued' | 'console'
  error?: string
}

const SMTP_CONFIGURED = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER)

export async function sendEmail(args: EmailArgs): Promise<EmailResult> {
  if (!args.to) return { ok: false, transport: 'console', error: 'No recipient' }

  // Always log to server so devs can see what would go out
  console.log('[email]', JSON.stringify({
    to: args.to,
    subject: args.subject,
    bodyLength: args.html.length,
    transport: SMTP_CONFIGURED ? 'smtp' : 'queued',
  }))

  if (!SMTP_CONFIGURED) {
    // Persist to a simple email_queue using the Config table as a JSON list
    try {
      const existing = await prisma.config.findUnique({ where: { key: 'email_queue' } })
      const queue: EmailArgs[] = existing?.value ? JSON.parse(existing.value) : []
      queue.push({ ...args, ...(args.text ? {} : { text: stripHtml(args.html) }) })
      // Keep queue capped at last 200 messages so we don't bloat config
      const trimmed = queue.slice(-200)
      await prisma.config.upsert({
        where: { key: 'email_queue' },
        update: { value: JSON.stringify(trimmed) },
        create: { key: 'email_queue', value: JSON.stringify(trimmed) },
      })
      return { ok: true, transport: 'queued' }
    } catch (err) {
      console.error('[email] queue failed', err)
      return { ok: false, transport: 'console', error: String(err) }
    }
  }

  // ─── Real SMTP path (lazy-require nodemailer if installed) ────────────
  try {
    const nodemailer = await import('nodemailer')
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? '"Convertt HR" <hr@convertt.co>',
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text ?? stripHtml(args.html),
    })
    return { ok: true, transport: 'smtp' }
  } catch (err) {
    console.error('[email] smtp send failed', err)
    return { ok: false, transport: 'smtp', error: String(err) }
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

// ─── Pre-built templates ─────────────────────────────────────────────────

export function compensationChangeEmail(opts: {
  employeeName: string
  oldGross: number
  newGross: number
  effectiveDate: Date
  type: string
  reason: string | null
}): { subject: string; html: string } {
  const fmt = (n: number) => `PKR ${Math.round(n).toLocaleString('en-PK')}`
  const diff = opts.newGross - opts.oldGross
  const pct = opts.oldGross > 0 ? ((diff / opts.oldGross) * 100).toFixed(1) : null
  const typeMap: Record<string, string> = {
    INCREMENT: 'annual increment',
    PROMOTION: 'promotion',
    BONUS: 'bonus',
    ADJUSTMENT: 'compensation adjustment',
    INITIAL: 'initial compensation setup',
  }
  const typeLabel = typeMap[opts.type] ?? 'change'

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:24px auto;background:white;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
    <div style="background:#0f172a;color:white;padding:24px 28px">
      <h2 style="margin:0;font-size:18px">💼 Compensation Update</h2>
      <p style="margin:4px 0 0;font-size:13px;color:#94a3b8">Convertt Ltd · HR &amp; Payroll</p>
    </div>
    <div style="padding:24px 28px">
      <p style="margin:0 0 12px">Hello ${opts.employeeName},</p>
      <p style="margin:0 0 16px">
        We're writing to confirm a ${typeLabel} to your compensation, effective
        <strong>${opts.effectiveDate.toLocaleDateString('en-GB', { dateStyle: 'long' })}</strong>.
      </p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
        <tr><td style="padding:8px 0;color:#64748b">Previous gross</td><td style="padding:8px 0;text-align:right;color:#475569">${fmt(opts.oldGross)}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b">New gross</td><td style="padding:8px 0;text-align:right;font-weight:600;color:#0f172a">${fmt(opts.newGross)}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;border-top:1px solid #e2e8f0">Change</td><td style="padding:8px 0;text-align:right;font-weight:700;color:${diff >= 0 ? '#059669' : '#dc2626'};border-top:1px solid #e2e8f0">${diff >= 0 ? '+' : ''}${fmt(diff)}${pct ? ` (${pct}%)` : ''}</td></tr>
      </table>
      ${opts.reason ? `<p style="margin:16px 0 8px;font-size:13px;color:#64748b"><strong>Reason:</strong> ${opts.reason}</p>` : ''}
      <p style="margin:16px 0 0;font-size:13px;color:#64748b">
        This change is reflected in your next payroll run. You can view your full compensation
        history any time on the People → Compensation tab of your profile.
      </p>
      <p style="margin:24px 0 0;font-size:13px">
        Warm regards,<br>
        <strong>People Operations</strong><br>
        Convertt Ltd
      </p>
    </div>
    <div style="background:#f1f5f9;padding:12px 28px;font-size:11px;color:#94a3b8;text-align:center">
      Confidential. This message contains private compensation information.
    </div>
  </div>
</body>
</html>`.trim()

  return {
    subject: `Compensation update — effective ${opts.effectiveDate.toLocaleDateString('en-GB')}`,
    html,
  }
}

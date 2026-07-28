/**
 * Login-invite flow — self-set password links.
 *
 * HR sends an employee a one-time link (7-day expiry). The employee opens
 * /set-password?token=…, chooses a password, and is signed in. Only the
 * SHA-256 hash of the token is ever persisted; the raw token exists only
 * inside the outgoing email.
 *
 * Used by:
 *   POST /api/invites        — per-employee send
 *   POST /api/invites/bulk   — all active employees without a login
 */
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'

export const LOGIN_INVITE_TEMPLATE_KEY = 'LOGIN_INVITE'
const INVITE_TTL_DAYS = 7

export function hashInviteToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex')
}

export function inviteBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    'https://convertt-hr.vercel.app'
  ).replace(/\/$/, '')
}

const firstName = (full: string) => full.split(' ')[0] || full

/**
 * Idempotently seed the LOGIN_INVITE template so the email queue UI shows
 * it alongside the rest of the library. Body uses [Square Bracket] vars.
 */
async function ensureLoginInviteTemplate(): Promise<{ id: string; subject: string; body: string }> {
  const subject = 'Set up your Convertt HR account'
  const body = `<p>Dear [First Name],</p>

<p>An account has been created for you on <b>Convertt HR</b> — the portal where you can view your attendance, apply for leave, access your payslips, and manage your employee profile.</p>

<p>To activate your account, please set your password using the button below:</p>

<p style="margin:24px 0;text-align:center">
  <a href="[Set Password Link]" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 28px;border-radius:8px">Set my password</a>
</p>

<p style="font-size:13px;color:#64748b">If the button does not work, copy and paste this link into your browser:<br>[Set Password Link]</p>

<p>Please note that this link expires in <b>7 days</b> and can only be used once. If it expires, contact HR for a new one.</p>

<p>Alternatively, you may sign in at any time using <b>Continue with Google</b> with this same email address ([Sent To]).</p>

<p>Best Regards,<br>
HR Team<br>
<b>Convertt</b></p>`

  const tpl = await prisma.emailTemplate.upsert({
    where: { key: LOGIN_INVITE_TEMPLATE_KEY },
    update: {},
    create: {
      key: LOGIN_INVITE_TEMPLATE_KEY,
      category: 'Onboarding',
      name: 'Login Invite — Set Your Password',
      triggerEvent: 'login.invite',
      condition: 'always',
      delay: 'immediate',
      channel: 'email',
      manualReview: false,
      active: true,
      subject,
      body,
      description: 'One-time self-set-password link so an employee can activate their Convertt HR login.',
      variables: JSON.stringify(['First Name', 'Set Password Link', 'Sent To']),
    },
    select: { id: true, subject: true, body: true },
  })
  return tpl
}

function substituteVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\[([^\]]+)\]/g, (m, name: string) => vars[name] ?? m)
}

export interface CreateInviteResult {
  ok: boolean
  sentTo?: string
  error?: string
  status?: number
}

/**
 * Generate + persist (hash only) a fresh invite token for an employee,
 * invalidate any prior unused tokens, and queue/send the LOGIN_INVITE email.
 * NEVER returns or logs the raw token.
 */
export async function createLoginInvite(args: {
  employeeId: string
  sendTo?: 'work' | 'personal'
  createdById: string
}): Promise<CreateInviteResult> {
  const employee = await prisma.employee.findUnique({
    where: { id: args.employeeId },
    select: { id: true, fullName: true, email: true, personalEmail: true, status: true },
  })
  if (!employee) return { ok: false, error: 'Employee not found', status: 404 }

  const workEmail = employee.email?.toLowerCase() || null
  const personalEmail = employee.personalEmail?.toLowerCase() || null
  const target =
    args.sendTo === 'personal' ? personalEmail : (workEmail ?? personalEmail)
  if (!target) {
    return {
      ok: false,
      error:
        args.sendTo === 'personal'
          ? 'Employee has no personal email on file'
          : 'Employee has no email on file — they cannot log in',
      status: 400,
    }
  }

  // Raw token: 32 cryptographically-random bytes, URL-safe.
  const rawToken = crypto.randomBytes(32).toString('base64url')
  const tokenHash = hashInviteToken(rawToken)
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)

  await prisma.$transaction([
    // Invalidate prior unused tokens for this employee.
    prisma.inviteToken.updateMany({
      where: { employeeId: employee.id, usedAt: null },
      data: { expiresAt: new Date() },
    }),
    prisma.inviteToken.create({
      data: {
        employeeId: employee.id,
        tokenHash,
        sentTo: target,
        expiresAt,
        createdById: args.createdById,
      },
    }),
  ])

  const link = `${inviteBaseUrl()}/set-password?token=${rawToken}`

  // Queue via the existing email template/queue system (EmailTemplate +
  // EmailSend), then attempt delivery through the shared transport.
  const tpl = await ensureLoginInviteTemplate()
  const vars: Record<string, string> = {
    'First Name': firstName(employee.fullName),
    'Set Password Link': link,
    'Sent To': target,
  }
  const subject = substituteVars(tpl.subject, vars)
  const body = substituteVars(tpl.body, vars)

  const send = await prisma.emailSend.create({
    data: {
      templateId: tpl.id,
      toEmployeeId: employee.id,
      toEmail: target,
      subject,
      body,
      status: 'QUEUED',
      dedupeKey: `login-invite:${tokenHash.slice(0, 32)}`,
      eventName: 'login.invite',
      createdById: args.createdById,
    },
  })

  const result = await sendEmail({ to: target, subject, html: body })
  await prisma.emailSend.update({
    where: { id: send.id },
    data: result.ok
      ? { status: 'SENT', sentAt: new Date() }
      : { status: 'FAILED', failedReason: result.error ?? 'Send failed' },
  })

  if (!result.ok) {
    return { ok: false, error: 'Invite created but the email failed to send. Retry from the email queue.', status: 502 }
  }
  return { ok: true, sentTo: target }
}

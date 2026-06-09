/**
 * Email body templates — match the existing Convertt email tone from HR.
 * Each builder returns { subject, bodyHtml }.
 *
 * Bodies are plain HTML, formatted similar to Gmail rich-text composition
 * (so HR can edit them in a contenteditable / textarea in the queue UI
 * before sending).
 */

import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'

type Emp = Prisma.EmployeeGetPayload<{
  include: { department: true; salary: true; reportingManager: true }
}>

const fmtMoney = (n: number) => `PKR ${Math.round(n).toLocaleString('en-PK')}`
const fmtDate = (d: Date | string | null | undefined) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}
const firstName = (full: string) => full.split(' ')[0] ?? full

// ─── Onboarding: Permanent / Probation Offer Letter Email ────────────────────

export function permanentOfferEmail(emp: Emp): { subject: string; bodyHtml: string } {
  const gross = emp.salary
    ? emp.salary.basic + emp.salary.houseRent + emp.salary.utilities +
      emp.salary.food + emp.salary.fuel + emp.salary.medicalAllowance + emp.salary.otherAllowance
    : 0

  const subject = `Employment Offer Letter – ${emp.designation} Position | Convertt`

  const bodyHtml = `<p>Hi ${firstName(emp.fullName)},</p>

<p>I hope you are doing well.</p>

<p>On behalf of the HR team at Convertt, I am pleased to <b>congratulate</b> you on being selected for the <b>${emp.designation}</b> position. We were impressed with your profile and are excited to welcome you to our team.</p>

<p>Below are the details of your employment:</p>

<p><b>Joining Date:</b> ${fmtDate(emp.joiningDate)}<br>
<b>Probation Period (First 3 Months)</b></p>

<ul>
  <li><b>Compensation:</b> ${gross > 0 ? `${fmtMoney(gross)} per month (gross)` : '[Salary to be confirmed]'}</li>
  <li><b>Timings:</b> ${emp.timings ?? '10:00 AM – 7:00 PM'}</li>
  <li><b>Working Days:</b> ${(emp.workDays ?? 'Mon,Tue,Wed,Thu,Fri').replace(/,/g, ' to ').replace(/Mon to.*Fri/, 'Monday to Friday')}</li>
  <li><b>Office Location:</b> Generatives, Mega Tower – 63-B Main Boulevard Gulberg, 5th Floor, Office No. 201, Lahore</li>
</ul>

<p>At Convertt, we specialize in custom app and software development with a strong focus on AI-driven solutions. We are confident that your skills and enthusiasm will contribute positively to our growing team.</p>

<p>To complete your <b>onboarding process</b>, we require the following documents:</p>

<ul>
  <li><b>Identification:</b> One photocopy of your CNIC.</li>
  <li><b>Photograph:</b> One passport-sized photograph.</li>
  <li><b>Education:</b> One photocopy of your latest educational degree (or official transcript if currently studying).</li>
  <li><b>Experience:</b> Employment experience letter from your previous employer.</li>
</ul>

<p>Please confirm your acceptance of this offer by replying to this email. We look forward to having you onboard and working together toward shared success.</p>

<p><b>Congratulations</b> once again!</p>

<p>Best Regards,<br>
Tahreem Waheed<br>
<b>Associate HR</b><br>
<b>Convertt</b></p>`

  return { subject, bodyHtml }
}

// ─── Onboarding: Training / Internship Offer Letter Email ────────────────────

export function internshipOfferEmail(emp: Emp): { subject: string; bodyHtml: string } {
  const gross = emp.salary
    ? emp.salary.basic + emp.salary.houseRent + emp.salary.utilities +
      emp.salary.food + emp.salary.fuel + emp.salary.medicalAllowance + emp.salary.otherAllowance
    : 0

  const subject = `Training Offer Letter – ${emp.designation} Position | Convertt`

  const bodyHtml = `<p>Hi ${firstName(emp.fullName)},</p>

<p>I hope you are doing well.</p>

<p>On behalf of the HR team at Convertt, I am pleased to <b>congratulate</b> you on being selected for the <b>${emp.designation}</b> position. We were impressed with your profile and are excited to welcome you to our team.</p>

<p>Below are the details of your employment:</p>

<p><b>Joining Date:</b> ${fmtDate(emp.joiningDate)}<br>
<b>Training Period (First 2 Months)</b></p>

<ul>
  <li><b>Compensation:</b> ${gross > 0 ? `${fmtMoney(gross)} per month` : '[Stipend to be confirmed]'}</li>
  <li><b>Training Timings:</b> ${emp.timings ?? '11:00 AM – 3:00 PM (Day) & 9:00 PM – 3:00 AM (Night) Remote'}</li>
  <li><b>Working Days:</b> ${(emp.workDays ?? 'Mon,Tue,Wed,Thu,Fri').replace(/,/g, ' to ').replace(/Mon to.*Fri/, 'Monday to Friday')}</li>
  <li><b>Office Location:</b> Generatives, Mega Tower – 63-B Main Boulevard Gulberg, 5th Floor, Office No. 201, Lahore</li>
</ul>

<p>At Convertt, we specialize in custom app and software development with a strong focus on AI-driven solutions. We are confident that your skills and enthusiasm will contribute positively to our growing team.</p>

<p>To complete your <b>onboarding process</b>, we require the following documents:</p>

<ul>
  <li>One clear photocopy of your CNIC.</li>
  <li>One passport-sized photograph.</li>
  <li>Photocopy of your latest educational degree (or official transcript if currently studying).</li>
  <li>Employment experience letter from your previous employer.</li>
  <li>Last three months' salary slips from the previous company.</li>
</ul>

<p>Please confirm your acceptance of this offer by replying to this email. We look forward to having you onboard and working together toward shared success.</p>

<p><b>Congratulations</b> once again!</p>

<p>Best Regards,<br>
Tahreem Waheed<br>
<b>Associate HR</b><br>
<b>Convertt</b></p>`

  return { subject, bodyHtml }
}

// ─── Probation Confirmation Email ────────────────────────────────────────────

export function confirmationEmail(emp: Emp, effectiveDate: Date): { subject: string; bodyHtml: string } {
  const subject = `Confirmation of Employment – ${emp.fullName} | Convertt`

  const bodyHtml = `<p>Hi ${firstName(emp.fullName)},</p>

<p><b>Congratulations!</b></p>

<p>In recognition of your performance and your valuable contribution to the organization during your Probation Period, we are pleased to inform you that you have been confirmed as a <b>permanent employee</b>, effective ${fmtDate(effectiveDate)}, as per our company's Employee Policies.</p>

<p>As a <b>${emp.designation}</b> in a CRO agency, your role is critical in creating seamless user experiences that drive conversions. To support your continued growth and success, here's some constructive feedback:</p>

<ul>
  <li><b>Create a Roadmap:</b> Develop a clear and detailed project roadmap for every design task. Proper planning and structured timelines will help you deliver high-quality designs efficiently while aligning with CRO goals.</li>
  <li><b>Enhance Communication:</b> Be proactive in sharing your design feedback, iterations, and insights with the team. Clear and timely communication with stakeholders and developers is essential for smooth handoffs and better project outcomes.</li>
  <li><b>Deepen CRO &amp; User Behavior Understanding:</b> We encourage you to proactively deepen your knowledge of conversion rate optimization principles, user psychology, and A/B testing methodologies. Understanding how design decisions directly impact conversions will help you create more effective and results-driven interfaces.</li>
</ul>

<p>We are excited to see you grow further in your role and continue delivering impactful designs that help our clients improve their conversion rates.</p>

<p>Congratulations once again! We look forward to your continued energy, creativity, and team spirit at Convertt.</p>

<p>Regards,<br>
<b>HR Department</b><br>
<b>Convertt</b></p>`

  return { subject, bodyHtml }
}

// ─── Offboarding emails ──────────────────────────────────────────────────────

export function noticePeriodEmail(emp: Emp, lastWorkingDay: Date): { subject: string; bodyHtml: string } {
  const subject = `Notice Period Confirmation – ${emp.fullName} | Convertt`

  const bodyHtml = `<p>Hi ${firstName(emp.fullName)},</p>

<p>This is to formally confirm that your notice period at Convertt has commenced, in accordance with our standard one (1) month notice policy.</p>

<p><b>Your last working day shall be ${fmtDate(lastWorkingDay)}.</b></p>

<p>During the notice period, you are expected to:</p>

<ul>
  <li>Continue performing all assigned duties professionally and to your usual standard.</li>
  <li>Coordinate with your reporting manager for a complete handover of responsibilities, ongoing projects, and pending deliverables.</li>
  <li>Return all company property (laptop, ID card, access keys, peripherals) on or before your last working day.</li>
  <li>Complete the Exit Clearance Form and Exit Interview with HR before departure.</li>
  <li>Continue to abide by the confidentiality and intellectual-property obligations of your NDA, which survive your employment.</li>
</ul>

<p>Your final payslip and Full &amp; Final (F&amp;F) settlement, including any unused leave encashment and pending dues, shall be processed and disbursed within the agreed window post-departure.</p>

<p>We thank you for your contributions to Convertt and wish you the very best in your future endeavours.</p>

<p>Regards,<br>
<b>HR Department</b><br>
<b>Convertt</b></p>`

  return { subject, bodyHtml }
}

export function terminationEmail(emp: Emp, lastWorkingDay: Date, reason: string): { subject: string; bodyHtml: string } {
  const subject = `Termination of Employment – ${emp.fullName} | Convertt`

  const bodyHtml = `<p>Dear ${emp.fullName},</p>

<p>This letter serves as formal notification that your employment with Convertt is hereby terminated, effective <b>${fmtDate(lastWorkingDay)}</b>.</p>

<p>The decision has been made for the following reason:</p>

<blockquote style="border-left:3px solid #b91c1c;background:#fee2e2;padding:10px 14px;margin:10px 0">${reason}</blockquote>

<p>You are required to:</p>

<ul>
  <li>Return all company property — laptop, ID card, access keys, peripherals — to IT on or before your last working day.</li>
  <li>Complete the Exit Clearance Form with sign-offs from all relevant departments.</li>
  <li>Continue to honour your confidentiality and intellectual-property obligations under your NDA, which survive termination.</li>
</ul>

<p>Your Full &amp; Final (F&amp;F) settlement shall be processed and disbursed within 30 days from the date of separation, subject to clearance of all assets and dues.</p>

<p>You may collect your experience letter from HR after completing the exit clearance process.</p>

<p>Regards,<br>
<b>HR Department</b><br>
<b>Convertt</b></p>`

  return { subject, bodyHtml }
}

export function experienceLetterEmail(emp: Emp): { subject: string; bodyHtml: string } {
  const subject = `Experience Letter – ${emp.fullName} | Convertt`

  const bodyHtml = `<p>Hi ${firstName(emp.fullName)},</p>

<p>Please find attached your Experience Letter from Convertt, confirming your tenure with us as <b>${emp.designation}</b> from ${fmtDate(emp.joiningDate)} to ${fmtDate(emp.exitDate ?? new Date())}.</p>

<p>It was a pleasure having you on the team. We wish you success in all your future endeavours, and you'll always be welcome back as part of the Convertt alumni community.</p>

<p>Should you ever need anything from us — a reference, a re-employment, or just to say hello — please don't hesitate to get in touch.</p>

<p>Best wishes,<br>
<b>HR Department</b><br>
<b>Convertt</b></p>`

  return { subject, bodyHtml }
}

// ─── Trigger → builder lookup ────────────────────────────────────────────────

export type EmailTrigger =
  | 'OFFER_PERMANENT'
  | 'OFFER_INTERN'
  | 'CONFIRMATION'
  | 'NOTICE_PERIOD'
  | 'TERMINATION'
  | 'EXPERIENCE_LETTER'

export function buildEmail(
  trigger: EmailTrigger,
  emp: Emp,
  extras: { effectiveDate?: Date; lastWorkingDay?: Date; reason?: string } = {},
): { subject: string; bodyHtml: string } {
  switch (trigger) {
    case 'OFFER_PERMANENT':   return permanentOfferEmail(emp)
    case 'OFFER_INTERN':      return internshipOfferEmail(emp)
    case 'CONFIRMATION':      return confirmationEmail(emp, extras.effectiveDate ?? emp.confirmationDate ?? new Date())
    case 'NOTICE_PERIOD':     return noticePeriodEmail(emp, extras.lastWorkingDay ?? new Date())
    case 'TERMINATION':       return terminationEmail(emp, extras.lastWorkingDay ?? new Date(), extras.reason ?? 'As discussed.')
    case 'EXPERIENCE_LETTER': return experienceLetterEmail(emp)
  }
}

// ─── DB-backed template lookup ────────────────────────────────────────────────
// Editable from /dashboard/settings/email-templates (HR_ADMIN). Falls back
// to the hardcoded builders above when no row exists for the given key.

/**
 * Simple {{var}} substitution. Unmatched placeholders are left in place
 * so HR sees them in the queue UI and can fill them manually.
 */
export function substituteVars(template: string, vars: Record<string, string | undefined>): string {
  return template.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_m, k) => {
    const v = vars[k]
    return v == null ? `{{${k}}}` : String(v)
  })
}

/**
 * Look up an EmailTemplate by key. Returns null if not found.
 * Caller falls back to hardcoded builders.
 */
export async function lookupTemplate(key: string): Promise<{ subject: string; body: string } | null> {
  try {
    const row = await prisma.emailTemplate.findUnique({ where: { key } })
    if (!row) return null
    return { subject: row.subject, body: row.body }
  } catch {
    return null
  }
}

export const TRIGGER_LABELS: Record<EmailTrigger, string> = {
  OFFER_PERMANENT:   'Offer Letter (Permanent / Probation)',
  OFFER_INTERN:      'Offer Letter (Training / Internship)',
  CONFIRMATION:      'Confirmation of Employment',
  NOTICE_PERIOD:     'Notice Period Confirmation',
  TERMINATION:       'Termination of Employment',
  EXPERIENCE_LETTER: 'Experience Letter',
}

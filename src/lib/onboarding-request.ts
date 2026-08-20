/**
 * The onboarding-documents request — the email a new joiner gets asking them
 * to send the papers HR needs before Day 1.
 *
 * It lists exactly what is still outstanding for this person rather than a
 * fixed checklist, so somebody who already handed over their CNIC is not asked
 * for it again. The wording is plain: it is a request to a new colleague, not a
 * legal notice.
 *
 * Nothing is sent from here. The email is generated for HR to copy or open in
 * their own mailbox, so no address is ever invented and HR chooses who it goes
 * to — the same rule the rest of the app follows.
 */

import { BRAND_NAME, HR_EMAIL } from '@/lib/brand'

export interface RequestedDoc {
  documentType: string
  label: string
}

/** What a new hire is asked to provide, in the order the form lists them. */
export const ONBOARDING_DOCUMENT_LABELS: Record<string, string> = {
  CNIC: 'CNIC (both sides, clear photocopy or scan)',
  PHOTO: 'A recent passport-size photograph',
  ADDRESS_PROOF: 'Proof of address (utility bill or tenancy document)',
  EDUCATIONAL_CERTIFICATE: 'Your latest degree or transcript',
  EXPERIENCE: 'Experience or relieving letters from previous employers',
  BANK: 'Bank account details (title, IBAN, branch)',
}

export interface DocumentRequestInput {
  employeeName: string
  docs: RequestedDoc[]
  /** Where they upload — their onboarding workspace. */
  uploadUrl?: string | null
  firstDay?: Date | string | null
}

export interface EmailDraft { subject: string; body: string }

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || full
}

function longDate(d: Date | string | null | undefined): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

export function buildDocumentRequest(input: DocumentRequestInput): EmailDraft {
  const first = firstName(input.employeeName)
  const day = longDate(input.firstDay)

  const out: string[] = []
  out.push(`Hi ${first},`)
  out.push('')
  out.push(
    `Welcome to ${BRAND_NAME}! We're looking forward to having you`
    + `${day ? `, and to your first day on ${day}` : ''}.`,
  )
  out.push('')

  if (input.docs.length) {
    out.push('To finish setting you up, could you send us the following:')
    out.push('')
    for (const d of input.docs) {
      const label = d.label || ONBOARDING_DOCUMENT_LABELS[d.documentType] || d.documentType
      out.push(`  • ${label}`)
    }
    out.push('')
  } else {
    // Everything is already on file — the request becomes a thank-you.
    out.push('We already have your documents on file — nothing further is needed. Thank you!')
    out.push('')
  }

  if (input.docs.length && input.uploadUrl) {
    out.push('The easiest way is to upload them straight to your onboarding page:')
    out.push(`  ${input.uploadUrl}`)
    out.push('')
    out.push('Or just reply to this email with them attached — whichever suits you.')
    out.push('')
  } else if (input.docs.length) {
    out.push('Please reply to this email with them attached.')
    out.push('')
  }

  out.push(
    'If anything is hard to get hold of right now, tell us and we will work '
    + 'around it — none of this needs to hold up your start.',
  )
  out.push('')
  out.push('Looking forward to working with you.')
  out.push('')
  out.push(`${BRAND_NAME} — People & Culture`)
  out.push(HR_EMAIL)

  return {
    subject: `${BRAND_NAME} — a few documents before your first day`,
    body: out.join('\n'),
  }
}

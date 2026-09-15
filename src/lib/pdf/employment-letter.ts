/**
 * Employment Letter as a real PDF, on the measured Convertt letterhead.
 *
 * Two steps, so HR can edit between them: `employmentLetterText` writes the
 * letter from the employee's record — date, subject, paragraphs, signatory —
 * and `renderLetterText` draws whatever text it is given. The editor in
 * Letters → Employment Letter shows the first, lets any of it be changed, and
 * sends the result to the second.
 *
 * Body copy is the issued sample (Umer Afzal, 1 July 2026), with the terms as
 * one paragraph rather than the sample's bullets.
 */
import {
  startLetter, finishLetter, drawParagraph, leavesSignSpace, BODY_LEADING, BODY_PARA_GAP,
} from './letterhead'

export interface EmploymentLetterData {
  fullName: string
  cnic?: string | null
  designation: string
  joiningDate: Date
  /** Gross monthly, PKR. 0 renders the placeholder. */
  compensation: number
  timings: string
  workingDays: string
  probationMonths?: number
  letterDate?: Date
}

/** The letter as text — everything HR can change before it is drawn. */
export interface EmploymentLetterText {
  letterDate: string
  subject: string
  /** One entry per paragraph. A line break inside one starts a new line with no gap. */
  paragraphs: string[]
  signatoryName: string
  signatoryTitle: string
}

export const LETTER_TEXT_LIMITS = { paragraphs: 20, paragraphChars: 3000, lineChars: 200 }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

/** "July 1, 2026" — the letterhead date format. */
function longDate(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

/** "1st July, 2026" — how the sample writes the joining date. */
function ordinalDate(d: Date): string {
  const n = d.getDate()
  const s = n % 10 === 1 && n !== 11 ? 'st'
    : n % 10 === 2 && n !== 12 ? 'nd'
    : n % 10 === 3 && n !== 13 ? 'rd' : 'th'
  return `${n}${s} ${MONTHS[d.getMonth()]}, ${d.getFullYear()}`
}

export function employmentLetterText(d: EmploymentLetterData): EmploymentLetterText {
  return {
    letterDate: longDate(d.letterDate ?? new Date()),
    subject: 'Subject: Employment Letter',
    paragraphs: [
      `On behalf of the HR team at Convertt, I am pleased to congratulate ${d.fullName}`
        + `${d.cnic ? ` CNIC ${d.cnic}` : ''} on your selection for the ${d.designation} position.`
        + ' We were impressed with your profile and are excited to welcome you to our team.',
      // The terms as one paragraph, not a bulleted list: HR asked for it this
      // way, and the list's bullet glyph printed as an empty box.
      `Your joining date is ${ordinalDate(d.joiningDate)}, and your probation period is`
        + ` ${d.probationMonths ?? 3} months, dependent upon your performance. Your compensation is`
        + ` PKR ${d.compensation > 0 ? d.compensation.toLocaleString('en-US') : '[Compensation]'} per month,`
        + ` your timings are ${d.timings}, and your working days are ${d.workingDays}. You will be based at`
        + ' our office: Convertt, Mega Tower – 63-B Main Boulevard Gulberg, 5th Floor, Office No. 201, Lahore.',
      // The revenue, uplift and "we make them perform" lines came out at HR's
      // request, 15 September 2026.
      'Convertt is a CRO-focused design and development agency working with ecommerce brands,'
        + ' dental practices, and weight loss clinics across the US, UK, and UAE.',
      'We look forward to having you onboard and working together towards shared success.',
      'Congratulations once again!',
    ],
    signatoryName: 'Syed Khawer',
    signatoryTitle: 'Director Administration',
  }
}

/**
 * Draw the letter. `fits` is false when the text runs so long that the
 * signature block could not keep its full sign-and-stamp space.
 */
export async function renderLetterText(t: EmploymentLetterText): Promise<{ bytes: Uint8Array; fits: boolean }> {
  const l = await startLetter({ letterDate: t.letterDate, subject: t.subject })

  let y = l.bodyStart
  let lastBaseline = y
  const paragraphs = t.paragraphs.map((p) => p.trim()).filter(Boolean)
  paragraphs.forEach((p, i) => {
    const lines = p.split(/\r?\n/).map((s) => s.trim())
    for (const line of lines) {
      if (!line) { y -= BODY_LEADING; continue }
      y = drawParagraph(l.page, l.fonts, [{ text: line }], y)
      lastBaseline = y + BODY_LEADING
    }
    if (i < paragraphs.length - 1) y -= BODY_PARA_GAP
  })

  const bytes = await finishLetter(
    l,
    { name: t.signatoryName.trim() || 'Syed Khawer', title: t.signatoryTitle.trim() || 'Director Administration' },
    { lastBaseline },
  )
  return { bytes, fits: leavesSignSpace(lastBaseline) }
}

export async function renderEmploymentLetter(d: EmploymentLetterData): Promise<Uint8Array> {
  return (await renderLetterText(employmentLetterText(d))).bytes
}

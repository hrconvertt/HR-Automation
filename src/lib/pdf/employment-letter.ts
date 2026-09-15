/**
 * Employment Letter as a real PDF, on the measured Convertt letterhead.
 *
 * Body copy is the issued sample (Umer Afzal, 1 July 2026) with nothing added.
 * Only the employee-specific values vary.
 */
import {
  startLetter, finishLetter, drawParagraph, BODY_LEADING, BODY_PARA_GAP, type Run,
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

export async function renderEmploymentLetter(d: EmploymentLetterData): Promise<Uint8Array> {
  const l = await startLetter({
    letterDate: longDate(d.letterDate ?? new Date()),
    subject: 'Subject: Employment Letter',
  })

  let y = l.bodyStart
  let lastBaseline = y
  const para = (runs: Run[], gap = BODY_PARA_GAP) => {
    y = drawParagraph(l.page, l.fonts, runs, y)
    lastBaseline = y + BODY_LEADING
    y -= gap
  }

  para([{
    text: `On behalf of the HR team at Convertt, I am pleased to congratulate ${d.fullName}`
      + `${d.cnic ? ` CNIC ${d.cnic}` : ''} on your selection for the ${d.designation} position.`
      + ' We were impressed with your profile and are excited to welcome you to our team.',
  }])

  // The terms as one paragraph, not a bulleted list: HR asked for it this way,
  // and the list's bullet glyph printed as an empty box.
  para([{
    text: `Your joining date is ${ordinalDate(d.joiningDate)}, and your probation period is`
      + ` ${d.probationMonths ?? 3} months, dependent upon your performance. Your compensation is`
      + ` PKR ${d.compensation > 0 ? d.compensation.toLocaleString('en-US') : '[Compensation]'} per month,`
      + ` your timings are ${d.timings}, and your working days are ${d.workingDays}. You will be based at`
      + ' our office: Convertt, Mega Tower – 63-B Main Boulevard Gulberg, 5th Floor, Office No. 201, Lahore.',
  }])

  para([{
    text: 'Convertt is a CRO-focused design and development agency working with ecommerce brands,'
      + ' dental practices, and weight loss clinics across the US, UK, and UAE. We’ve generated over'
      + ' $1B in tracked client revenue with an average 3.5X conversion uplift across 120+ projects.'
      + ' Our work sits at the intersection of conversion strategy, design, and development. We don’t'
      + ' just make things look good, we make them perform.',
  }])

  para([{ text: 'We look forward to having you onboard and working together towards shared success.' }])
  para([{ text: 'Congratulations once again!' }])

  return finishLetter(l, undefined, { lastBaseline })
}

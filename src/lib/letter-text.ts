/**
 * Every letter as the editor holds it: a date, a subject, paragraphs and who
 * signs. The same shape the employment letter PDF is drawn from, so every
 * letter type is written, previewed and downloaded on the one letterhead.
 *
 * Pure functions only: the editor imports this file too.
 */
import { LETTER_TYPES, LETTER_TYPE_LABEL, type LetterType } from '@/lib/letter-templates'

export interface LetterText {
  letterDate: string
  subject: string
  paragraphs: string[]
  signatoryName: string
  signatoryTitle: string
}

export const DEFAULT_SIGNATORY = { name: 'Syed Khawer', title: 'Director Administration' }

/** The letters HR can write, in the order the "Letter" dropdown lists them. */
export const WRITABLE_LETTERS: { type: string; label: string }[] = [
  { type: 'EMPLOYMENT', label: 'Employment Letter' },
  ...LETTER_TYPES.map((t) => ({ type: t, label: letterLabel(t) })),
]

export function letterLabel(type: string): string {
  if (type === 'EMPLOYMENT') return 'Employment Letter'
  if (type === 'BONAFIDE') return 'Employment Verification Letter'
  return LETTER_TYPE_LABEL[type as LetterType] ?? type.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

/** "September 18, 2026", the letterhead date format, in Pakistan time. */
export function letterheadDate(d: Date = new Date()): string {
  const pk = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Karachi' }))
  return `${MONTHS[pk.getMonth()]} ${pk.getDate()}, ${pk.getFullYear()}`
}

/**
 * A generated or stored plain-text letter body into editor text. The body
 * ends with its own sign-off ("For Convertt, / name / title / Date: …"),
 * which the letterhead draws itself, so it is taken off and its name and
 * title kept as the signatory.
 */
export function bodyToText(body: string, opts: { subject: string; date?: Date | null; signatoryName?: string | null; signatoryTitle?: string | null }): LetterText {
  const lines = body.replace(/\r\n/g, '\n').split('\n')
  const signAt = lines.findIndex((l) => /^For Convertt,?\s*$/i.test(l.trim()))
  let signName = opts.signatoryName ?? null
  let signTitle = opts.signatoryTitle ?? null
  let bodyLines = lines
  if (signAt >= 0) {
    const sign = lines.slice(signAt + 1).map((l) => l.trim()).filter((l) => l && !/^Date:/i.test(l))
    signName = signName ?? sign[0] ?? null
    signTitle = signTitle ?? sign[1] ?? null
    bodyLines = lines.slice(0, signAt)
  }
  const paragraphs = bodyLines.join('\n').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  return {
    letterDate: letterheadDate(opts.date ?? new Date()),
    subject: `Subject: ${opts.subject}`,
    paragraphs,
    signatoryName: signName || DEFAULT_SIGNATORY.name,
    signatoryTitle: signTitle || DEFAULT_SIGNATORY.title,
  }
}

/** Editor text as plain text, for letterBody (search, the older print page). */
export function textToBody(t: LetterText): string {
  const paragraphs = t.paragraphs.map((p) => p.trim()).filter(Boolean).join('\n\n')
  return `${paragraphs}\n\nFor Convertt,\n\n${t.signatoryName}\n${t.signatoryTitle}\nDate: ${t.letterDate}`
}

export function parseLetterText(json: string | null | undefined): LetterText | null {
  if (!json) return null
  try {
    const t = JSON.parse(json) as Partial<LetterText>
    if (!Array.isArray(t.paragraphs)) return null
    return {
      letterDate: String(t.letterDate ?? ''),
      subject: String(t.subject ?? ''),
      paragraphs: t.paragraphs.map((p) => String(p ?? '')),
      signatoryName: String(t.signatoryName ?? ''),
      signatoryTitle: String(t.signatoryTitle ?? ''),
    }
  } catch {
    return null
  }
}

/** The text of a stored letter: its saved editor text, or its older plain body. */
export function storedLetterText(letter: {
  letterType: string
  letterText: string | null
  letterBody: string | null
  reviewedAt: Date | null
  requestedAt: Date
  signedByName: string | null
  signedByTitle: string | null
}): LetterText | null {
  const saved = parseLetterText(letter.letterText)
  if (saved) return saved
  if (!letter.letterBody) return null
  return bodyToText(letter.letterBody, {
    subject: letterLabel(letter.letterType),
    date: letter.reviewedAt ?? letter.requestedAt,
    signatoryName: letter.signedByName,
    signatoryTitle: letter.signedByTitle,
  })
}

/**
 * An employee's documents, sorted into the stages of their time here.
 *
 * The profile's Documents tab used to be one flat table in the order things
 * were uploaded, with a type pill on every row and four unlabelled icons —
 * a salary slip sat above the NDA above the profile photo, and nothing said
 * what was missing. This groups every document by what it is for, lists the
 * ones each stage expects even when they are not on file, and folds in the
 * two kinds of paperwork that never lived in the documents table: payslips
 * (from payroll) and letters Convertt issued (from Letters).
 *
 *   Hiring & joining        employment letter, agreement, NDA, CV
 *   Identity & background   CNIC, photo, address proof, education, past experience
 *   Pay & tax               payslips, salary history, tax and bank papers
 *   Letters from Convertt   confirmation, salary certificate, verification…
 *   Conduct                 show cause notices
 *   Training & health       certificates, medical, insurance
 *   Exit                    the exit clearance prerequisites, for leavers
 *   Other
 *
 * Every document type belongs to exactly one section, so nothing is listed
 * twice. Two move with the person's status: an experience letter is a past
 * employer's while they work here and Convertt's once they have left, and a
 * show cause belongs to the exit when the company ended the employment.
 *
 * Server-side: the page builds the view and hands plain data to the client.
 */
import { docTypeLabel } from '@/lib/document-types'
import { exitDocumentsFor } from '@/lib/exit-documents'

export const DEPARTED_STATUSES = ['RESIGNED', 'TERMINATED', 'LAYOFF']

export interface DocView {
  id: string
  name: string
  type: string
  typeLabel: string
  dateLabel: string
  expiryLabel: string | null
  expired: boolean
  visibleToEmployee: boolean
  /** False for link-only rows (imported Drive links, lazily drawn slips). */
  hasFile: boolean
  href: string
  sizeLabel: string | null
}

export interface ExpectedRow {
  type: string
  label: string
  hint: string
  required: boolean
  files: DocView[]
  generateHref: string | null
  generateLabel: string | null
}

export interface PayslipView {
  id: string
  period: string
  net: string
  status: string
  href: string
}

export interface LetterView {
  id: string
  title: string
  number: string | null
  status: string
  dateLabel: string
  href: string | null
}

export interface SectionView {
  key: string
  title: string
  description: string
  expected: ExpectedRow[]
  extra: DocView[]
  payslips: PayslipView[]
  letters: LetterView[]
  onFile: number
  missing: number
}

export interface RawDoc {
  id: string
  name: string
  type: string
  url: string
  createdAt: Date
  expiryDate: Date | null
  visibleToEmployee: boolean
  fileSize: number | null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const day = (d: Date) => `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`

function size(bytes: number | null): string | null {
  if (!bytes) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function view(d: RawDoc, today: Date): DocView {
  return {
    id: d.id,
    name: d.name,
    type: d.type,
    typeLabel: docTypeLabel(d.type),
    dateLabel: day(d.createdAt),
    expiryLabel: d.expiryDate ? day(d.expiryDate) : null,
    expired: !!d.expiryDate && d.expiryDate < today,
    visibleToEmployee: d.visibleToEmployee,
    hasFile: !(d.url && !d.fileSize),
    // Salary slips link to the printable payslip; everything else streams its bytes.
    href: d.type === 'SALARY_SLIP' && d.url ? d.url : `/api/documents/${d.id}/download`,
    sizeLabel: size(d.fileSize),
  }
}

const SECTIONS: { key: string; title: string; description: string }[] = [
  { key: 'hiring', title: 'Hiring & joining', description: 'The letter, agreement and NDA they joined on.' },
  { key: 'identity', title: 'Identity & background', description: 'Who they are, and where they came from.' },
  { key: 'pay', title: 'Pay & tax', description: 'Payslips from payroll, and salary, tax and bank papers.' },
  { key: 'letters', title: 'Letters from Convertt', description: 'Letters issued through Letters, with their numbers.' },
  { key: 'conduct', title: 'Conduct', description: 'Show cause notices and replies.' },
  { key: 'training', title: 'Training & health', description: 'Certificates, medical and insurance records.' },
  { key: 'exit', title: 'Exit', description: 'The exit clearance paperwork.' },
  { key: 'other', title: 'Other documents', description: 'Anything that fits nowhere above.' },
]

function sectionOf(type: string, departed: boolean, terminated: boolean): string {
  switch (type) {
    case 'OFFER_LETTER': case 'EMPLOYMENT_AGREEMENT': case 'NDA': case 'RESUME': case 'REFERENCE_LETTER':
      return 'hiring'
    case 'CNIC': case 'PHOTO': case 'ADDRESS_PROOF': case 'EDUCATIONAL_CERTIFICATE':
    case 'VISA_PASSPORT': case 'DRIVING_LICENSE':
      return 'identity'
    case 'EXPERIENCE':
      return departed ? 'exit' : 'identity'
    case 'SALARY_SLIP': case 'SALARY_HISTORY': case 'TAX_CERTIFICATE': case 'BANK_STATEMENT':
      return 'pay'
    case 'SHOW_CAUSE':
      return departed && terminated ? 'exit' : 'conduct'
    case 'NOTICE_PERIOD': case 'TERMINATION_LETTER': case 'EXIT_INTERVIEW': case 'EXIT_CLEARANCE':
    case 'RELIEVING_CERTIFICATE':
      return 'exit'
    case 'TRAINING_CERTIFICATE': case 'MEDICAL_REPORT': case 'INSURANCE_CARD': case 'VACCINATION_RECORD':
      return 'training'
    default:
      return 'other'
  }
}

type Expect = Omit<ExpectedRow, 'files'>

/** The exit checklist names things as steps ("Exit Interview Done"); here they are documents. */
const EXIT_LABEL: Record<string, string> = {
  SHOW_CAUSE: 'Show cause notice',
  NOTICE_PERIOD: 'Notice period letter',
  TERMINATION_LETTER: 'Termination letter',
  EXIT_INTERVIEW: 'Exit interview form',
  EXIT_CLEARANCE: 'Exit clearance form',
  EXPERIENCE: 'Experience letter',
  RELIEVING_CERTIFICATE: 'Relieving certificate',
}

function expectedFor(key: string, employeeId: string, departed: boolean, terminated: boolean): Expect[] {
  const gen = (t: string) => `/api/documents/generate?type=${t}&employeeId=${employeeId}`
  if (key === 'hiring') {
    return [
      { type: 'OFFER_LETTER', label: 'Employment letter', hint: 'Signed by the Director Administration.', required: true,
        generateHref: `/dashboard/letters/employment?employeeId=${employeeId}`, generateLabel: 'Write the letter' },
      { type: 'EMPLOYMENT_AGREEMENT', label: 'Employment agreement', hint: 'Appointment, salary, probation, leave and conduct.', required: true,
        generateHref: gen('employment_agreement'), generateLabel: 'Draft the agreement' },
      { type: 'NDA', label: 'Non-disclosure agreement', hint: 'Confidentiality and intellectual property.', required: true,
        generateHref: gen('nda'), generateLabel: 'Draft the NDA' },
      { type: 'RESUME', label: 'CV', hint: 'The CV they applied with.', required: false, generateHref: null, generateLabel: null },
    ]
  }
  if (key === 'identity') {
    const rows: Expect[] = [
      { type: 'CNIC', label: 'CNIC', hint: 'Both sides.', required: true, generateHref: null, generateLabel: null },
      { type: 'PHOTO', label: 'Photo', hint: 'Used on their profile.', required: true, generateHref: null, generateLabel: null },
      { type: 'ADDRESS_PROOF', label: 'Address proof', hint: 'A utility bill or tenancy agreement.', required: true, generateHref: null, generateLabel: null },
      { type: 'EDUCATIONAL_CERTIFICATE', label: 'Educational certificates', hint: 'Highest qualification.', required: true, generateHref: null, generateLabel: null },
    ]
    if (!departed) {
      rows.push({ type: 'EXPERIENCE', label: 'Experience letters', hint: 'From previous employers.', required: false, generateHref: null, generateLabel: null })
    }
    return rows
  }
  if (key === 'exit' && departed) {
    const seen = new Set<string>()
    const rows: Expect[] = []
    for (const d of exitDocumentsFor(terminated ? 'TERMINATION' : 'RESIGNATION')) {
      // The NDA is already listed under Hiring & joining.
      if (d.fileAs === 'NDA' || seen.has(d.fileAs)) continue
      seen.add(d.fileAs)
      rows.push({
        type: d.fileAs,
        label: EXIT_LABEL[d.fileAs] ?? d.label.replace(/\s*\(.*\)\s*$/, ''),
        hint: d.hint,
        required: true,
        generateHref: d.generator ? gen(d.generator) : null,
        generateLabel: d.generator ? 'Draft it' : null,
      })
    }
    return rows
  }
  return []
}

export function buildDocumentSections(input: {
  employeeId: string
  status: string
  docs: RawDoc[]
  payslips: PayslipView[]
  letters: LetterView[]
  /** HR sees what is missing; everyone else sees only what is there. */
  showMissing: boolean
  today: Date
}): SectionView[] {
  const departed = DEPARTED_STATUSES.includes(input.status)
  const terminated = input.status === 'TERMINATED' || input.status === 'LAYOFF'
  // A slip filed from payroll points at the payslip it draws; the payslip list
  // already shows it, so it is not listed twice.
  const payslipHrefs = new Set(input.payslips.map((p) => p.href))

  const out: SectionView[] = []
  for (const s of SECTIONS) {
    const files = input.docs
      .filter((d) => sectionOf(d.type, departed, terminated) === s.key)
      .filter((d) => !(d.type === 'SALARY_SLIP' && d.url && payslipHrefs.has(d.url)))
      .map((d) => view(d, input.today))

    const expected = expectedFor(s.key, input.employeeId, departed, terminated)
      .map((e) => ({ ...e, files: files.filter((f) => f.type === e.type) }))
      .filter((e) => input.showMissing || e.files.length > 0)
    const claimed = new Set(expected.map((e) => e.type))
    const extra = files.filter((f) => !claimed.has(f.type))
    const payslips = s.key === 'pay' ? input.payslips : []
    const letters = s.key === 'letters' ? input.letters : []

    if (!expected.length && !extra.length && !payslips.length && !letters.length) continue
    out.push({
      ...s,
      expected,
      extra,
      payslips,
      letters,
      onFile: files.length + payslips.length + letters.length,
      missing: expected.filter((e) => e.required && e.files.length === 0).length,
    })
  }
  return out
}

/**
 * The employee information intake — the digital version of the paper form.
 *
 * One definition drives three things: the fields the new joiner fills, the
 * columns the API is allowed to write, and the labels the printable PDF uses.
 * Keeping them in one place is the point — the form, the record and the paper
 * copy cannot drift into asking for different things.
 *
 * Job Details (department, role, hire date) are deliberately NOT here. Those
 * are HR's to set, not the new hire's to claim, and they already exist on the
 * record from the offer. The intake collects what only the person themselves
 * can give.
 */

export type IntakeKind = 'text' | 'email' | 'tel' | 'date' | 'select' | 'textarea'

export interface IntakeField {
  /** The Employee column this writes to. */
  key: string
  label: string
  kind: IntakeKind
  required?: boolean
  options?: string[]
  help?: string
  /** Half-width on wide screens, so pairs sit side by side. */
  half?: boolean
}

export interface IntakeSection {
  title: string
  blurb?: string
  fields: IntakeField[]
}

export const INTAKE_SECTIONS: IntakeSection[] = [
  {
    title: 'Personal Information',
    fields: [
      { key: 'fullName', label: 'Full name', kind: 'text', required: true },
      { key: 'personalEmail', label: 'Personal email', kind: 'email', required: true, half: true,
        help: 'Where we can reach you outside work' },
      { key: 'phone', label: 'Phone', kind: 'tel', required: true, half: true },
      { key: 'gender', label: 'Gender', kind: 'select', options: ['Male', 'Female'], required: true, half: true },
      { key: 'dob', label: 'Date of birth', kind: 'date', required: true, half: true },
      { key: 'cnic', label: 'CNIC number', kind: 'text', required: true, half: true,
        help: 'As printed, with or without dashes' },
      { key: 'ibanAccount', label: 'IBAN', kind: 'text', half: true,
        help: 'For salary — 24 characters starting PK' },
      { key: 'temporaryAddress', label: 'Current address', kind: 'textarea' },
      { key: 'address', label: 'Permanent address', kind: 'textarea', required: true },
    ],
  },
  {
    title: 'Mailing Address',
    blurb: 'Used for your bank account and any post we send you.',
    fields: [
      { key: 'addressLine1', label: 'Address line 1', kind: 'text', required: true },
      { key: 'addressLine2', label: 'Address line 2', kind: 'text' },
      { key: 'city', label: 'City', kind: 'text', required: true, half: true },
      { key: 'stateProvince', label: 'State / Province', kind: 'text', required: true, half: true },
      { key: 'postalCode', label: 'Postal code', kind: 'text', required: true, half: true },
      { key: 'country', label: 'Country', kind: 'text', required: true, half: true },
    ],
  },
  {
    title: 'Emergency Contact',
    blurb: 'Someone we can call if we ever need to.',
    fields: [
      { key: 'emergencyContact', label: 'Name', kind: 'text', required: true, half: true },
      { key: 'emergencyRelation', label: 'Relationship', kind: 'text', required: true, half: true },
      { key: 'emergencyPhone', label: 'Phone', kind: 'tel', required: true, half: true },
      { key: 'emergencyEmail', label: 'Email', kind: 'email', half: true },
    ],
  },
  {
    title: 'Bank Account Opening Details',
    blurb: 'The bank needs these exactly as they appear on your CNIC.',
    fields: [
      { key: 'cnicFullName', label: 'Full name (as per CNIC)', kind: 'text', required: true },
      { key: 'fatherOrHusbandName', label: "Father's / Husband's name", kind: 'text', required: true, half: true },
      { key: 'mothersMaidenName', label: "Mother's maiden name", kind: 'text', required: true, half: true },
      { key: 'cnicIssuedOn', label: 'CNIC — date of issuance', kind: 'date', required: true, half: true },
      { key: 'cnicExpiresOn', label: 'CNIC — expiry date', kind: 'date', required: true, half: true },
      { key: 'cnicBirthDate', label: 'CNIC — date of birth', kind: 'date', half: true },
      { key: 'placeOfBirth', label: 'CNIC — place of birth', kind: 'text', required: true, half: true },
      { key: 'maritalStatus', label: 'Marital status', kind: 'select',
        options: ['Single', 'Married', 'Divorced', 'Widowed'], required: true, half: true },
    ],
  },
]

/** Every writable key, and which are dates (so the API parses them). */
export const INTAKE_FIELDS: IntakeField[] = INTAKE_SECTIONS.flatMap((s) => s.fields)
export const INTAKE_KEYS = INTAKE_FIELDS.map((f) => f.key)
export const INTAKE_DATE_KEYS = INTAKE_FIELDS.filter((f) => f.kind === 'date').map((f) => f.key)
export const INTAKE_REQUIRED_KEYS = INTAKE_FIELDS.filter((f) => f.required).map((f) => f.key)

/** Which employee-uploaded documents the intake expects alongside the fields. */
export const INTAKE_DOCUMENTS = [
  { documentType: 'CNIC', label: 'CNIC — front and back', required: true },
  { documentType: 'PHOTO', label: 'Passport-size photograph', required: false },
] as const

export type IntakeValues = Record<string, string>

/** How complete the intake is, counting only required fields. */
export function intakeProgress(values: IntakeValues): { done: number; total: number; pct: number } {
  const total = INTAKE_REQUIRED_KEYS.length
  const done = INTAKE_REQUIRED_KEYS.filter((k) => (values[k] ?? '').toString().trim()).length
  return { done, total, pct: total ? Math.round((done / total) * 100) : 100 }
}

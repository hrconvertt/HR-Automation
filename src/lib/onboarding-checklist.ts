/**
 * The onboarding document checklist — the master sheet's columns, as data.
 *
 * The sheet has three states per cell, not two: signed, missing, and "None",
 * which means the document does not apply. An intern has no employment
 * agreement; a permanent hire has no internship appointment letter. Storing
 * "not applicable" as a third boolean would let it drift out of step with the
 * employment type, so it is derived instead: change someone from intern to
 * permanent and the right columns go live on their own.
 */

export type CellState = 'DONE' | 'MISSING' | 'NA'

export interface ChecklistColumn {
  key: string
  /** Short header, for the table. */
  label: string
  /** What it means, for the tooltip. */
  meaning: string
  group: 'NDA' | 'INTERNSHIP' | 'AGREEMENT' | 'DOCS'
  /** Which side signs it — used to pair the two halves visually. */
  side?: 'EMPLOYEE' | 'COMPANY'
  /** Employment types this applies to. Absent means everyone. */
  onlyFor?: ReadonlyArray<string>
}

/** Employment types that get an internship appointment letter, not a contract. */
export const INTERN_TYPES = ['INTERN', 'INTERNSHIP', 'TRAINEE'] as const
/** Employment types that get a full employment agreement. */
export const STAFF_TYPES = ['PERMANENT', 'PROBATION', 'CONTRACT', 'FULL_TIME', 'PART_TIME'] as const

export const CHECKLIST_COLUMNS: ChecklistColumn[] = [
  { key: 'ndaSigned', label: 'NDA — employee', group: 'NDA', side: 'EMPLOYEE',
    meaning: 'NDA signed by the employee' },
  { key: 'ndaSignedByCompany', label: 'NDA — Convertt', group: 'NDA', side: 'COMPANY',
    meaning: 'NDA countersigned by Convertt' },

  { key: 'internshipLetterSigned', label: 'Internship letter — employee',
    group: 'INTERNSHIP', side: 'EMPLOYEE', onlyFor: INTERN_TYPES,
    meaning: 'Internship appointment letter signed by the intern' },
  { key: 'internshipLetterSignedByCompany', label: 'Internship letter — Convertt',
    group: 'INTERNSHIP', side: 'COMPANY', onlyFor: INTERN_TYPES,
    meaning: 'Internship appointment letter countersigned by Convertt' },

  { key: 'agreementSigned', label: 'Agreement — employee',
    group: 'AGREEMENT', side: 'EMPLOYEE', onlyFor: STAFF_TYPES,
    meaning: 'Employment agreement signed by the employee' },
  { key: 'agreementSignedByCompany', label: 'Agreement — Convertt',
    group: 'AGREEMENT', side: 'COMPANY', onlyFor: STAFF_TYPES,
    meaning: 'Employment agreement countersigned by Convertt' },

  { key: 'photoTaken', label: 'Pic', group: 'DOCS',
    meaning: 'Profile photograph on file' },
  { key: 'cnicCopied', label: 'CNIC', group: 'DOCS',
    meaning: 'CNIC copy on file — Playbook SOP-02 requires the original sighted' },
  { key: 'educationDocsCopied', label: 'Education', group: 'DOCS',
    meaning: 'Degree or transcript on file' },
  { key: 'experienceLettersCopied', label: 'Experience', group: 'DOCS',
    meaning: 'Experience letters from previous employers' },
  { key: 'certificationOnFile', label: 'Certification', group: 'DOCS',
    meaning: 'Professional certification, where the role calls for one' },
]

export const CHECKLIST_KEYS = CHECKLIST_COLUMNS.map((c) => c.key)

/**
 * Which EmployeeDocument types stand as evidence for a ticked column.
 *
 * A tick is a claim; the uploaded file is the proof. Columns absent from this
 * map are ticked from something other than a file (a countersignature, a photo
 * taken in the office) and are never flagged — flagging what cannot be
 * evidenced would cry wolf on every row.
 */
export const CHECKLIST_EVIDENCE: Record<string, ReadonlyArray<string>> = {
  ndaSigned: ['NDA'],
  agreementSigned: ['AGREEMENT', 'EMPLOYMENT_AGREEMENT', 'CONTRACT'],
  internshipLetterSigned: ['INTERNSHIP_LETTER', 'APPOINTMENT_LETTER', 'OFFER_LETTER'],
  cnicCopied: ['CNIC'],
  educationDocsCopied: ['EDUCATIONAL_CERTIFICATE', 'EDUCATION', 'DEGREE'],
  experienceLettersCopied: ['EXPERIENCE', 'EXPERIENCE_LETTER'],
  photoTaken: ['PHOTO'],
  certificationOnFile: ['CERTIFICATION', 'CERTIFICATE'],
}

/** Columns that can be evidenced by an upload. */
export const EVIDENCED_KEYS = Object.keys(CHECKLIST_EVIDENCE)

/**
 * Ticked columns with no matching document on file. `docTypes` is what the
 * employee actually has uploaded.
 */
export function unevidencedTicks(
  checklist: Record<string, boolean> | null | undefined,
  docTypes: ReadonlyArray<string>,
  employeeType: string | null | undefined,
): string[] {
  if (!checklist) return []
  const have = new Set(docTypes.map((t) => t.toUpperCase()))
  const out: string[] = []
  for (const col of CHECKLIST_COLUMNS) {
    if (!applies(col, employeeType)) continue
    if (checklist[col.key] !== true) continue
    const accepts = CHECKLIST_EVIDENCE[col.key]
    if (!accepts) continue
    if (!accepts.some((t) => have.has(t))) out.push(col.key)
  }
  return out
}

export const GROUP_LABELS: Record<ChecklistColumn['group'], string> = {
  NDA: 'NDA',
  INTERNSHIP: 'Internship appointment letter',
  AGREEMENT: 'Employment agreement',
  DOCS: 'Documents on file',
}

/** Whether a column applies to someone on this employment type. */
export function applies(col: ChecklistColumn, employeeType: string | null | undefined): boolean {
  if (!col.onlyFor) return true
  // With no type recorded we cannot rule the column out, so it stays live and
  // shows as missing — better a false chase than a document quietly excused.
  if (!employeeType) return true
  return col.onlyFor.includes(employeeType.toUpperCase())
}

export function cellState(
  col: ChecklistColumn,
  checklist: Record<string, unknown> | null,
  employeeType: string | null | undefined,
): CellState {
  if (!applies(col, employeeType)) return 'NA'
  return checklist?.[col.key] === true ? 'DONE' : 'MISSING'
}

export interface RowProgress { done: number; total: number; pct: number }

/** Completion counting only the columns that apply to this person. */
export function rowProgress(
  checklist: Record<string, unknown> | null,
  employeeType: string | null | undefined,
): RowProgress {
  const live = CHECKLIST_COLUMNS.filter((c) => applies(c, employeeType))
  const done = live.filter((c) => checklist?.[c.key] === true).length
  return {
    done,
    total: live.length,
    pct: live.length ? Math.round((done / live.length) * 100) : 0,
  }
}

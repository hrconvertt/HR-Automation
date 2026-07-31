/**
 * Read an employee document with Claude and pull the structured details out of
 * it, so a scanned CNIC or bank letter populates the profile instead of sitting
 * in the Documents tab as a file nobody opens.
 *
 * Two deliberate limits:
 *
 *  - Every key in FIELD_MAP is a real `Employee` column, checked against
 *    schema.prisma. The model is told to return exactly these keys and nothing
 *    else, and anything it invents is dropped on the way back in — a
 *    hallucinated field name can never reach Prisma.
 *
 *  - The model is instructed to return null rather than guess. Extraction runs
 *    on identity documents, where a plausible-looking wrong CNIC or expiry date
 *    is far worse than a blank: it would be filled into payroll and compliance
 *    records that nobody re-checks.
 *
 * The caller decides what to do with the result. `POST /api/documents/[id]/extract`
 * only ever fills blanks and reports the rest as conflicts, matching how the
 * Employee Information Form importer behaves.
 */
import Anthropic from '@anthropic-ai/sdk'

export type FieldKind = 'string' | 'date'

/** Extraction key -> Employee scalar column. */
export const FIELD_MAP: Record<string, { field: string; kind: FieldKind; label: string; hint: string }> = {
  cnic:                { field: 'cnic',                kind: 'string', label: 'CNIC #',                hint: '13 digits, formatted 00000-0000000-0' },
  fatherOrHusbandName: { field: 'fatherOrHusbandName', kind: 'string', label: 'Father / Husband Name', hint: 'as printed, without the "S/O" or "D/O" prefix' },
  mothersMaidenName:   { field: 'mothersMaidenName',   kind: 'string', label: "Mother's Maiden Name",  hint: '' },
  cnicBirthDate:       { field: 'cnicBirthDate',       kind: 'date',   label: 'CNIC Birth Date',       hint: 'the date of birth printed on the CNIC' },
  cnicIssuedOn:        { field: 'cnicIssuedOn',        kind: 'date',   label: 'CNIC Issued On',        hint: '' },
  cnicExpiresOn:       { field: 'cnicExpiresOn',       kind: 'date',   label: 'CNIC Expires On',       hint: '' },
  placeOfBirth:        { field: 'placeOfBirth',        kind: 'string', label: 'Place of Birth',        hint: '' },
  cityOfBirth:         { field: 'cityOfBirth',         kind: 'string', label: 'City of Birth',         hint: '' },
  placeOfIssuance:     { field: 'placeOfIssuance',     kind: 'string', label: 'Place of Issuance',     hint: '' },
  dob:                 { field: 'dob',                 kind: 'date',   label: 'Date of Birth',         hint: '' },
  gender:              { field: 'gender',              kind: 'string', label: 'Gender',                hint: 'Male, Female or Other' },
  maritalStatus:       { field: 'maritalStatus',       kind: 'string', label: 'Marital Status',        hint: 'Single, Married, Divorced or Widowed' },
  nationalityCountry:  { field: 'nationalityCountry',  kind: 'string', label: 'Nationality',           hint: 'country name' },
  address:             { field: 'address',             kind: 'string', label: 'Permanent Address',     hint: 'the permanent / home address' },
  temporaryAddress:    { field: 'temporaryAddress',    kind: 'string', label: 'Temporary Address',     hint: 'the current address, only if clearly distinct from the permanent one' },
  phone:               { field: 'phone',               kind: 'string', label: 'Phone',                 hint: 'mobile number' },
  homePhone:           { field: 'homePhone',           kind: 'string', label: 'Home Phone',            hint: '' },
  officePhone:         { field: 'officePhone',         kind: 'string', label: 'Office Phone',          hint: '' },
  emergencyContact:    { field: 'emergencyContact',    kind: 'string', label: 'Emergency Contact',     hint: 'name of the emergency contact' },
  emergencyRelation:   { field: 'emergencyRelation',   kind: 'string', label: 'Emergency Relation',    hint: '' },
  emergencyPhone:      { field: 'emergencyPhone',      kind: 'string', label: 'Emergency Phone',       hint: '' },
  emergencyEmail:      { field: 'emergencyEmail',      kind: 'string', label: 'Emergency Email',       hint: '' },
  bankAccountName:     { field: 'bankAccountName',     kind: 'string', label: 'Account Title',         hint: 'the name the account is held in' },
  bankName:            { field: 'bankName',            kind: 'string', label: 'Bank Name',             hint: '' },
  bankBranch:          { field: 'bankBranch',          kind: 'string', label: 'Branch',                hint: '' },
  bankAccount:         { field: 'bankAccount',         kind: 'string', label: 'Account #',             hint: 'the plain account number, not the IBAN' },
  ibanAccount:         { field: 'ibanAccount',         kind: 'string', label: 'IBAN',                  hint: 'starts with PK for Pakistani banks' },
}

export type ExtractionKey = keyof typeof FIELD_MAP

/** Values a given document type could plausibly carry. Keeps the prompt short
 *  and stops a CV being mined for a CNIC expiry date it cannot contain. */
const BY_DOC_TYPE: Record<string, ExtractionKey[]> = {
  CNIC: ['cnic', 'fatherOrHusbandName', 'cnicBirthDate', 'cnicIssuedOn', 'cnicExpiresOn',
    'placeOfBirth', 'cityOfBirth', 'placeOfIssuance', 'dob', 'gender', 'address',
    'nationalityCountry', 'maritalStatus'],
  VISA_PASSPORT: ['cnic', 'fatherOrHusbandName', 'dob', 'gender', 'placeOfBirth',
    'nationalityCountry', 'address'],
  DRIVING_LICENSE: ['cnic', 'fatherOrHusbandName', 'dob', 'gender', 'address'],
  RESUME: ['phone', 'address', 'temporaryAddress', 'dob', 'gender'],
  ADDRESS_PROOF: ['address', 'temporaryAddress', 'phone'],
  BANK_STATEMENT: ['bankAccountName', 'bankName', 'bankBranch', 'bankAccount', 'ibanAccount', 'address'],
  MEDICAL_REPORT: ['dob', 'gender', 'phone'],
  INSURANCE_CARD: ['dob', 'gender', 'cnic'],
}

/** Anything not listed above gets the full catalog — a mixed "OTHER" scan can
 *  legitimately hold any of it. */
function keysFor(docType: string): ExtractionKey[] {
  return BY_DOC_TYPE[docType] ?? (Object.keys(FIELD_MAP) as ExtractionKey[])
}

export interface ExtractedValue {
  key: string
  field: string
  label: string
  /** Normalised: ISO date string for `date` fields, trimmed text otherwise. */
  value: string
}

export interface ExtractionResult {
  values: ExtractedValue[]
  /** Free-text note from the model — e.g. "back of CNIC, address partly cut off". */
  note: string | null
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Claude accepts images up to ~5MB and PDFs up to 32MB as base64. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_PDF_BYTES = 30 * 1024 * 1024

const SUPPORTED_IMAGE = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

export class ExtractionError extends Error {
  constructor(message: string, readonly status = 422) {
    super(message)
    this.name = 'ExtractionError'
  }
}

/**
 * Send one document to Claude and return the fields it could read.
 *
 * @param bytes    the document itself — image or PDF
 * @param mimeType as stored on the document row
 * @param docType  EmployeeDocument.type, used to narrow what we ask for
 * @param fullName the employee the document is filed under, so the model can
 *                 say when the document is plainly about somebody else
 */
export async function extractFromDocument({
  bytes, mimeType, docType, fullName,
}: {
  bytes: Buffer
  mimeType: string
  docType: string
  fullName: string
}): Promise<ExtractionResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ExtractionError('ANTHROPIC_API_KEY is not configured on this deployment.', 503)
  }

  const mime = mimeType.toLowerCase().split(';')[0].trim()
  const isPdf = mime === 'application/pdf'
  if (!isPdf && !SUPPORTED_IMAGE.has(mime)) {
    throw new ExtractionError(
      `Can't read "${mimeType}". Extraction works on PDF, JPEG, PNG, GIF and WebP.`,
    )
  }
  const limit = isPdf ? MAX_PDF_BYTES : MAX_IMAGE_BYTES
  if (bytes.length > limit) {
    throw new ExtractionError(
      `File is ${(bytes.length / 1024 / 1024).toFixed(1)}MB — the limit for ${isPdf ? 'PDFs' : 'images'} is ${limit / 1024 / 1024}MB.`,
    )
  }

  const keys = keysFor(docType)
  const schemaLines = keys.map((k) => {
    const f = FIELD_MAP[k]
    const kind = f.kind === 'date' ? 'YYYY-MM-DD string' : 'string'
    return `  "${k}": ${kind} | null   // ${f.label}${f.hint ? ` — ${f.hint}` : ''}`
  }).join('\n')

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // Built per branch rather than sharing one `source` object: a PDF goes in a
  // `document` block and an image in an `image` block, and each takes its own
  // media_type union, so a shared variable widens past what either accepts.
  const data = bytes.toString('base64')
  const fileBlock: Anthropic.ContentBlockParam = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
    : {
        type: 'image',
        source: {
          type: 'base64',
          media_type: mime as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data,
        },
      }

  const message = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 2000,
    system:
      'You read HR documents and return structured data. You transcribe only what is ' +
      'actually legible in the document. You never infer, complete, correct or guess a ' +
      'value — a blank is always better than a plausible invention, because these values ' +
      'are written into payroll and government-compliance records unchecked.',
    messages: [{
      role: 'user',
      content: [
        fileBlock,
        {
          type: 'text',
          text:
            `This document is filed in our HR system as a "${docType}" belonging to ${fullName}.\n\n` +
            `Return ONLY a JSON object, no prose and no markdown fence, of exactly this shape:\n\n` +
            `{\n${schemaLines}\n  "note": string | null   // anything the reader should know, e.g. unreadable areas, or that the document names a different person\n}\n\n` +
            `Rules:\n` +
            `- Use null for any value not clearly readable in this document. Most documents will have mostly nulls; that is expected and correct.\n` +
            `- Do not carry values over from what you know about the named person — read only this image.\n` +
            `- Dates must be YYYY-MM-DD. If a date is ambiguous (e.g. 03/04/25 could be either order), return null and say so in "note".\n` +
            `- If the document belongs to someone other than ${fullName}, set every field to null and explain in "note".\n` +
            `- Include no keys other than those listed.`,
        },
      ],
    }],
  })

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()

  return parseExtraction(text, keys)
}

/** Exported for testing: turn the model's reply into validated values. */
export function parseExtraction(text: string, keys: ExtractionKey[]): ExtractionResult {
  // Tolerate a stray ```json fence even though the prompt forbids one.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = (fenced ? fenced[1] : text).trim()
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end <= start) {
    throw new ExtractionError('The reader did not return readable data for this document.')
  }

  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(body.slice(start, end + 1))
  } catch {
    throw new ExtractionError('The reader returned malformed data for this document.')
  }

  const allowed = new Set<string>(keys)
  const values: ExtractedValue[] = []

  for (const [key, val] of Object.entries(raw)) {
    if (key === 'note') continue
    // Silently drop any key we did not ask for — this is the guard that stops
    // an invented field name reaching Prisma.
    if (!allowed.has(key)) continue
    if (val === null || val === undefined) continue

    const spec = FIELD_MAP[key]
    const s = String(val).trim()
    if (!s || s === '-' || s.toLowerCase() === 'null' || s.toLowerCase() === 'n/a') continue

    if (spec.kind === 'date') {
      if (!ISO_DATE.test(s)) continue
      const d = new Date(`${s}T00:00:00.000Z`)
      if (Number.isNaN(d.getTime())) continue
      // A CNIC issued in 1890 or expiring in 2400 is a misread, not a date.
      const year = d.getUTCFullYear()
      if (year < 1920 || year > 2100) continue
    }

    values.push({ key, field: spec.field, label: spec.label, value: s })
  }

  const note = typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim() : null
  return { values, note }
}

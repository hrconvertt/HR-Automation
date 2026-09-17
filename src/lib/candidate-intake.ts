/**
 * Getting candidates into a requisition's sheet in bulk.
 *
 * Two ways in, both landing in the same tracker columns
 * (src/lib/candidate-tracker.ts):
 *
 *  - A screened sheet HR already keeps — Excel, CSV, or a PDF of one. Its
 *    headers are matched to the tracker's columns and the position's own
 *    screening columns; a header that matches nothing can become a new
 *    screening column.
 *
 *  - CVs, many at once. Each is read against the job description and its
 *    details are written into the columns: contact, experience, companies,
 *    education, a fit score and verdict, and an answer for every one of the
 *    position's screening columns. Those columns can be suggested from the job
 *    description first, so the sheet asks what this role actually needs.
 *
 * Reading CVs, PDFs of sheets and job descriptions uses Claude. Without an
 * ANTHROPIC_API_KEY a CV still files the candidate with what plain text
 * matching finds (name, email, phone), and Excel/CSV import works fully.
 */
import Anthropic from '@anthropic-ai/sdk'
import * as XLSX from 'xlsx'
import { installPdfGlobals } from '@/lib/pdf-node-globals'
import { TRACKER_COLUMNS, type TrackerKey } from '@/lib/candidate-tracker'

const MODEL = 'claude-sonnet-5'

export const aiAvailable = () => !!process.env.ANTHROPIC_API_KEY

export class IntakeError extends Error {
  constructor(message: string, readonly status = 422) {
    super(message)
    this.name = 'IntakeError'
  }
}

// ─── Mapping a sheet's headers onto the tracker ─────────────────────────────

/** Where a sheet column goes: the name, a tracker column, the stage, a screening column, or nowhere. */
export type MapTarget = 'name' | 'stage' | TrackerKey | `screening:${string}` | `new:${string}` | ''

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Headers seen on Convertt's sourcing sheets and on common exports, by tracker column. */
const SYNONYMS: Record<string, string[]> = {
  name: ['name', 'candidate', 'candidatename', 'fullname', 'applicant', 'applicantname', 'nameofcandidate'],
  stage: ['step', 'stage', 'pipelinestage', 'status', 'currentstatus', 'hiringstage'],
  email: ['email', 'emailaddress', 'mail', 'emailid'],
  phone: ['phone', 'phonenumber', 'contact', 'contactnumber', 'contactno', 'mobile', 'mobilenumber', 'cell', 'whatsapp', 'number'],
  location: ['location', 'city', 'address', 'area', 'currentlocation', 'residence'],
  experienceSummary: ['experience', 'totalexperience', 'yearsofexperience', 'exp', 'relevantexperience', 'yearsexperience', 'workexperience'],
  currentRole: ['currentrole', 'designation', 'currentdesignation', 'jobtitle', 'currentposition', 'role'],
  currentCompany: ['currentcompany', 'company', 'employer', 'organization', 'organisation', 'currentorganization', 'currentemployer'],
  pastCompanies: ['pastcompanies', 'previouscompanies', 'previousemployers', 'workhistory', 'previousexperience'],
  education: ['education', 'degree', 'qualification', 'university', 'highestqualification', 'lastdegree'],
  verdict: ['verdict', 'decision', 'shortlisted', 'shortlist', 'recommendation', 'result'],
  matchScore: ['fitscore', 'fitscore100', 'score', 'matchscore', 'rating', 'match'],
  evaluation: ['evaluation', 'rationale', 'evaluationrationale', 'remarks', 'comments', 'assessment', 'screeningnotes'],
  whyLeaving: ['whyleaving', 'reasonforleaving', 'reasonforchange', 'reasonforswitch', 'reasontoleave'],
  currentSalary: ['currentsalary', 'currentctc', 'salary', 'currentpackage', 'currentpay'],
  expectedSalary: ['expectedsalary', 'expectedctc', 'expected', 'demand', 'salaryexpectation', 'expectedpackage', 'salarydemand'],
  offerResponse: ['ouroffer', 'offer', 'ouroffersatisfiedornot', 'offerresponse'],
  noticePeriod: ['noticeperiod', 'notice', 'availability', 'joining', 'immediatejoin', 'immediatejoinnoticeperiod', 'canjoin', 'joiningtime'],
  onsiteWillingness: ['onsite', 'onsitewillingness', 'willingtoworkonsite', 'onsiteok'],
  easyCommute: ['commute', 'easycommute'],
  communication: ['communication', 'communicationskills', 'english', 'communicationskill'],
  hrNotes: ['notes', 'overallnotes', 'hrnotes', 'note'],
  callOutcome: ['calloutcome', 'nextstep', 'calloutcomenextstep', 'callstatus'],
  interviewType: ['onsitevideointerview', 'interviewtype', 'interviewmode'],
  interviewDate: ['interviewdate', 'interviewtime', 'interviewdatetime'],
  interviewer: ['scheduledwith', 'scheduledwithlead', 'interviewer', 'interviewedby'],
  leadFeedback: ['feedback', 'feedbackbylead', 'leadfeedback', 'feedbackbyleadpooraveragegoodbest'],
  finalMeeting: ['finalmeeting', 'finalmeetingwithkhawar', 'finalmeetingwithkhawer'],
  finalMeetingDate: ['meetingdatewithkhawar', 'meetingdatewithkhawer', 'finalmeetingdate'],
  finalMeetingStatus: ['meetingstatuswithkhawar', 'meetingstatuswithkhawer', 'finalmeetingstatus'],
}

/** Best guess for each header. Nothing is guessed twice: the first header to claim a column keeps it. */
export function suggestMapping(headers: string[], screeningColumns: string[]): MapTarget[] {
  const taken = new Set<string>()
  const byLabel = new Map<string, MapTarget>()
  for (const c of TRACKER_COLUMNS) byLabel.set(norm(c.label), c.key)
  for (const s of screeningColumns) byLabel.set(norm(s), `screening:${s}`)
  for (const [target, words] of Object.entries(SYNONYMS)) {
    for (const w of words) if (!byLabel.has(w)) byLabel.set(w, target as MapTarget)
  }
  return headers.map((h): MapTarget => {
    const n = norm(h)
    if (!n) return ''
    const hit = byLabel.get(n)
    if (hit && !taken.has(hit)) { taken.add(hit); return hit }
    // A header nobody recognises is most likely one of the role's own questions.
    return `new:${h.replace(/\s+/g, ' ').trim().slice(0, 120)}`
  })
}

const STAGE_WORDS: Record<string, string> = {
  applied: 'APPLIED', new: 'APPLIED', sourced: 'APPLIED',
  screening: 'SCREENING', screened: 'SCREENING', shortlisted: 'SCREENING', callscheduled: 'SCREENING',
  interview: 'INTERVIEW', interviewing: 'INTERVIEW', interviewscheduled: 'INTERVIEW',
  offer: 'OFFER', offered: 'OFFER', hired: 'HIRED', joined: 'HIRED',
  rejected: 'REJECTED', declined: 'REJECTED', notselected: 'REJECTED', dropped: 'REJECTED',
}

export function stageFrom(value: string): string | null {
  return STAGE_WORDS[norm(value)] ?? null
}

// ─── Reading a sheet ─────────────────────────────────────────────────────────

export interface SheetTable { headers: string[]; rows: string[][]; sheetName: string | null; note: string | null }

export const MAX_IMPORT_ROWS = 2000

/**
 * The header row is the first row with at least two filled cells whose next
 * row also has content — sheets often open with a title line or a blank row.
 */
function tableFrom(matrix: string[][], sheetName: string | null): SheetTable {
  const filled = (r: string[]) => r.filter((c) => c.trim()).length
  let h = matrix.findIndex((r, i) => filled(r) >= 2 && (matrix[i + 1] ? filled(matrix[i + 1]) >= 1 : true))
  if (h < 0) h = 0
  const width = Math.max(0, ...matrix.slice(h).map((r) => r.length))
  const headers = Array.from({ length: width }, (_, i) => (matrix[h]?.[i] ?? '').trim() || `Column ${i + 1}`)
  const rows = matrix.slice(h + 1)
    .map((r) => Array.from({ length: width }, (_, i) => String(r[i] ?? '').trim()))
    .filter((r) => r.some(Boolean))
  // Drop columns that are empty in the header and every row.
  const keep = headers.map((hd, i) => !/^Column \d+$/.test(hd) || rows.some((r) => r[i]))
  return {
    headers: headers.filter((_, i) => keep[i]),
    rows: rows.slice(0, MAX_IMPORT_ROWS).map((r) => r.filter((_, i) => keep[i])),
    sheetName,
    note: rows.length > MAX_IMPORT_ROWS ? `Only the first ${MAX_IMPORT_ROWS} of ${rows.length} rows are read.` : null,
  }
}

export async function readSheet(bytes: Buffer, filename: string, mime: string): Promise<SheetTable> {
  const ext = filename.toLowerCase().split('.').pop() ?? ''
  if (ext === 'pdf' || mime === 'application/pdf') return readPdfTable(bytes)
  if (!['xlsx', 'xls', 'csv', 'ods', 'tsv'].includes(ext)) {
    throw new IntakeError('Upload an Excel file (.xlsx, .xls), a CSV, or a PDF of the sheet.', 400)
  }
  const wb = XLSX.read(bytes, { type: 'buffer', cellDates: true })
  // The sheet with the most filled rows is the one with the candidates on it.
  let best: SheetTable | null = null
  for (const name of wb.SheetNames) {
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: false, defval: '', blankrows: false })
      .map((r) => (r as unknown[]).map((c) => String(c ?? '')))
    const t = tableFrom(matrix, wb.SheetNames.length > 1 ? name : null)
    if (!best || t.rows.length > best.rows.length) best = t
  }
  if (!best || best.rows.length === 0) throw new IntakeError('No rows found in this file.')
  return best
}

function jsonFrom(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = (fenced ? fenced[1] : text).trim()
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end <= start) throw new IntakeError('The reader did not return readable data.')
  try {
    return JSON.parse(body.slice(start, end + 1))
  } catch {
    throw new IntakeError('The reader returned malformed data.')
  }
}

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
}

async function readPdfTable(bytes: Buffer): Promise<SheetTable> {
  if (!aiAvailable()) {
    throw new IntakeError('Reading a PDF sheet needs AI reading, which is not set up on this deployment. Upload the Excel or CSV instead.', 503)
  }
  if (bytes.length > 30 * 1024 * 1024) throw new IntakeError('The PDF is larger than 30 MB.')
  const client = new Anthropic()
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    system: 'You transcribe tables from documents exactly. You never invent, correct or summarise a value.',
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: bytes.toString('base64') } },
        {
          type: 'text',
          text: 'This PDF is a recruitment screening sheet: one row per candidate. Transcribe the candidate table.\n\n'
            + 'Return ONLY JSON: {"headers": string[], "rows": string[][], "note": string | null}\n'
            + '- headers: the column headings exactly as printed, left to right. If the table continues across pages, list the headings once.\n'
            + '- rows: every candidate row, one array per row, cells in the same order as headers; "" for an empty cell.\n'
            + '- Keep cell text as written (dates, salaries like "80k", "yes"). Join a cell that wraps onto several lines with a space.\n'
            + '- note: anything unreadable or cut off, else null.',
        },
      ],
    }],
  })
  const message = await stream.finalMessage()
  const raw = jsonFrom(textOf(message)) as { headers?: unknown; rows?: unknown; note?: unknown }
  const headers = Array.isArray(raw.headers) ? raw.headers.map((h) => String(h ?? '')) : []
  const rows = Array.isArray(raw.rows) ? raw.rows.filter(Array.isArray).map((r) => (r as unknown[]).map((c) => String(c ?? ''))) : []
  if (headers.length === 0 || rows.length === 0) throw new IntakeError('No candidate table could be read from this PDF.')
  const t = tableFrom([headers, ...rows], null)
  const note = [typeof raw.note === 'string' ? raw.note : null, t.note].filter(Boolean).join(' ')
  return { ...t, note: note || null }
}

// ─── Columns from the job description ────────────────────────────────────────

export interface JobForColumns {
  title: string
  jdContent: string | null
  description: string | null
  requirements: string | null
  minExperienceYears: number | null
}

export function jobText(j: JobForColumns): string {
  const body = j.jdContent || [j.description, j.requirements].filter(Boolean).join('\n\n') || ''
  const min = j.minExperienceYears != null && j.minExperienceYears > 0
    ? `\n\nMINIMUM EXPERIENCE REQUIRED: ${j.minExperienceYears === 0.5 ? '6 months' : `${j.minExperienceYears} years`}.`
    : ''
  return `Title: ${j.title}\n\n${body}`.slice(0, 12000) + min
}

/**
 * The questions this role should be screened on, read from its job
 * description: the tools, platforms and experience it asks for, each short
 * enough to be a column header and answerable from a CV.
 */
export async function suggestScreeningColumns(job: JobForColumns, existing: string[]): Promise<string[]> {
  if (!aiAvailable()) throw new IntakeError('Suggesting columns needs AI reading, which is not set up on this deployment.', 503)
  const fixed = TRACKER_COLUMNS.map((c) => c.label).join('; ')
  const client = new Anthropic()
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: 'You design recruitment screening sheets for a CRO design and development agency in Lahore.',
    messages: [{
      role: 'user',
      content: `${jobText(job)}\n\n---\n`
        + 'Suggest the screening columns a recruiter should fill for each candidate on this role: the specific tools, platforms, skills, domain experience or portfolio evidence this job description asks for.\n'
        + `The sheet already has these fixed columns, so do not repeat them: ${fixed}.\n`
        + (existing.length ? `It also already has these screening columns, so do not repeat them: ${existing.join('; ')}.\n` : '')
        + 'Rules: 5 to 10 columns; each label at most 5 words, written as a column header (e.g. "Figma / Adobe XD", "Shopify Liquid", "CRO experience", "Portfolio link"); each must be something a CV can answer; most important first.\n'
        + 'Return ONLY JSON: {"columns": string[]}',
    }],
  })
  const raw = jsonFrom(textOf(message)) as { columns?: unknown }
  const have = new Set([...existing, ...TRACKER_COLUMNS.map((c) => c.label)].map(norm))
  const out: string[] = []
  for (const c of Array.isArray(raw.columns) ? raw.columns : []) {
    const label = String(c ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
    if (!label || have.has(norm(label))) continue
    have.add(norm(label))
    out.push(label)
  }
  return out.slice(0, 10)
}

// ─── Reading a CV ────────────────────────────────────────────────────────────

export interface CvReading {
  fullName: string | null
  email: string | null
  phone: string | null
  location: string | null
  currentRole: string | null
  currentCompany: string | null
  pastCompanies: string | null
  education: string | null
  educationLevel: string | null
  experienceSummary: string | null
  totalExperienceYears: number | null
  skills: string[]
  matchScore: number | null
  verdict: string | null
  evaluation: string | null
  screening: Record<string, string>
  knockoutFailures: string[]
  /** How it was read. */
  readBy: 'ai' | 'text'
}

const LEVELS = ['HIGH_SCHOOL', 'DIPLOMA', 'BACHELORS', 'MASTERS', 'PHD']
const VERDICTS = ['STRONG', 'SHORTLIST', 'MAYBE', 'PASS', 'REJECT']
const IMAGE = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

export function cvKind(filename: string, mime: string): 'pdf' | 'docx' | 'text' | 'image' | null {
  const ext = filename.toLowerCase().split('.').pop() ?? ''
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf'
  if (ext === 'docx') return 'docx'
  if (ext === 'txt' || ext === 'md') return 'text'
  if (IMAGE.has(mime)) return 'image'
  return null
}

async function plainText(bytes: Buffer, kind: 'pdf' | 'docx' | 'text' | 'image'): Promise<string> {
  if (kind === 'text') return bytes.toString('utf-8')
  if (kind === 'docx') {
    const mammoth = await import('mammoth')
    return (await mammoth.extractRawText({ buffer: bytes })).value
  }
  if (kind === 'pdf') {
    installPdfGlobals()
    const { PDFParse } = await import('pdf-parse')
    const parser = new PDFParse({ data: new Uint8Array(bytes) })
    return (await parser.getText()).text
  }
  return ''
}

const str = (v: unknown, max = 1000): string | null => {
  if (v == null) return null
  const s = String(v).trim()
  if (!s || ['null', 'n/a', 'na', '-', 'none', 'not mentioned', 'not specified'].includes(s.toLowerCase())) return null
  return s.slice(0, max)
}

export async function readCv(opts: {
  bytes: Buffer; filename: string; mime: string; job: JobForColumns; screeningColumns: string[]
}): Promise<CvReading> {
  const kind = cvKind(opts.filename, opts.mime)
  if (!kind) throw new IntakeError('CVs can be PDF, Word (.docx), text, or an image.', 400)

  if (!aiAvailable()) {
    const text = await plainText(opts.bytes, kind)
    if (text.trim().length < 30) throw new IntakeError('No text could be read from this CV without AI reading.')
    const email = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0] ?? null
    const phone = text.match(/(\+?\d[\d\s().-]{8,}\d)/)?.[0]?.trim() ?? null
    const nameLine = text.split(/\r?\n/).map((l) => l.trim())
      .find((l) => /^[A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z.'-]+){1,3}$/.test(l) && l.length <= 40)
    return {
      fullName: nameLine ?? null, email, phone, location: null, currentRole: null, currentCompany: null,
      pastCompanies: null, education: null, educationLevel: null, experienceSummary: null,
      totalExperienceYears: null, skills: [], matchScore: null, verdict: null,
      evaluation: 'Uploaded without AI reading — only name, email and phone were picked up.',
      screening: {}, knockoutFailures: [], readBy: 'text',
    }
  }

  let fileBlock: Anthropic.ContentBlockParam
  if (kind === 'pdf') {
    fileBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: opts.bytes.toString('base64') } }
  } else if (kind === 'image') {
    fileBlock = {
      type: 'image',
      source: { type: 'base64', media_type: opts.mime as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: opts.bytes.toString('base64') },
    }
  } else {
    const text = await plainText(opts.bytes, kind)
    if (text.trim().length < 30) throw new IntakeError('No text could be read from this CV.')
    fileBlock = { type: 'text', text: `=== CV (${opts.filename}) ===\n${text.slice(0, 30000)}` }
  }

  const screeningSchema = opts.screeningColumns.length
    ? opts.screeningColumns.map((c) => `    ${JSON.stringify(c)}: string | null`).join(',\n')
    : ''

  const client = new Anthropic()
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system:
      'You read CVs for a recruiter and fill in their screening sheet. You write down only what the CV actually says. '
      + 'A blank is better than a guess: a wrong phone number or invented experience misleads the people hiring.',
    messages: [{
      role: 'user',
      content: [
        fileBlock,
        {
          type: 'text',
          text: `=== JOB DESCRIPTION ===\n${jobText(opts.job)}\n\n`
            + 'Read the CV above and return ONLY JSON of exactly this shape:\n'
            + '{\n'
            + '  "fullName": string | null,\n'
            + '  "email": string | null,\n'
            + '  "phone": string | null,\n'
            + '  "location": string | null,            // city, country\n'
            + '  "currentRole": string | null,\n'
            + '  "currentCompany": string | null,\n'
            + '  "pastCompanies": string | null,       // "Company — role (dates); Company — role (dates)", most recent first, excluding the current one\n'
            + '  "education": string | null,           // "Degree, Institution (year)"; highest first\n'
            + '  "educationLevel": "HIGH_SCHOOL" | "DIPLOMA" | "BACHELORS" | "MASTERS" | "PHD" | null,\n'
            + '  "experienceSummary": string | null,   // e.g. "4.5 years — 3 in Shopify development, 1.5 in WordPress"\n'
            + '  "totalExperienceYears": number | null,\n'
            + '  "skills": string[],\n'
            + '  "matchScore": number,                 // 0-100 fit against the job description\n'
            + '  "verdict": "STRONG" | "SHORTLIST" | "MAYBE" | "PASS" | "REJECT",\n'
            + '  "evaluation": string,                 // 2-3 sentences: why this score, strengths, gaps\n'
            + `  "screening": {\n${screeningSchema}\n  },\n`
            + '  "knockoutFailures": string[]           // hard requirements of the job this CV clearly fails; [] if none\n'
            + '}\n\n'
            + 'Rules:\n'
            + '- null for anything the CV does not state. Do not infer an email or phone.\n'
            + '- Each screening answer is short and specific to what the CV shows, e.g. "Yes — Figma, 3 years" or "No mention". Use null only if the question cannot be judged from a CV.\n'
            + '- Scores: 90-100 exceptional, 70-89 strong, 50-69 possible, 30-49 weak, 0-29 poor.',
        },
      ],
    }],
  })

  const raw = jsonFrom(textOf(message)) as Record<string, unknown>
  const years = Number(raw.totalExperienceYears)
  const score = Number(raw.matchScore)
  const level = str(raw.educationLevel)?.toUpperCase() ?? null
  const verdict = str(raw.verdict)?.toUpperCase() ?? null
  const screeningRaw = raw.screening && typeof raw.screening === 'object' ? raw.screening as Record<string, unknown> : {}
  const screening: Record<string, string> = {}
  for (const col of opts.screeningColumns) {
    const v = str(screeningRaw[col], 1000)
    if (v) screening[col] = v
  }
  return {
    fullName: str(raw.fullName, 200),
    email: str(raw.email, 200),
    phone: str(raw.phone, 60),
    location: str(raw.location, 200),
    currentRole: str(raw.currentRole, 200),
    currentCompany: str(raw.currentCompany, 200),
    pastCompanies: str(raw.pastCompanies, 3000),
    education: str(raw.education, 1000),
    educationLevel: level && LEVELS.includes(level) ? level : null,
    experienceSummary: str(raw.experienceSummary, 1000),
    totalExperienceYears: Number.isFinite(years) && years >= 0 && years < 60 ? Math.round(years * 10) / 10 : null,
    skills: Array.isArray(raw.skills) ? raw.skills.map((s) => String(s).trim()).filter(Boolean).slice(0, 40) : [],
    matchScore: Number.isFinite(score) && score >= 0 && score <= 100 ? Math.round(score) : null,
    verdict: verdict && VERDICTS.includes(verdict) ? verdict : null,
    evaluation: str(raw.evaluation, 3000),
    screening,
    knockoutFailures: Array.isArray(raw.knockoutFailures) ? raw.knockoutFailures.map((f) => String(f).trim()).filter(Boolean).slice(0, 10) : [],
    readBy: 'ai',
  }
}

/**
 * The job post editor's shapes, shared by the editor, the careers page and the
 * APIs behind both.
 *
 * Workable builds a job in five steps — the job, the application form, where to
 * find people, who is hiring, and how they will be interviewed. Each step saves
 * a piece of one JobRequisition row. The pieces that are lists rather than
 * columns are JSON strings, the way knockout reasons already are.
 *
 * No Prisma here: the application form renders on the public careers page and
 * in the editor's phone preview, so this file has to load in the browser.
 */

export const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TRAINEE'] as const
export const LEVELS = ['INTERN', 'JUNIOR', 'ASSOCIATE', 'MID_LEVEL', 'SENIOR', 'LEAD', 'MANAGER', 'HEAD', 'DIRECTOR'] as const
export const EDUCATION_LEVELS = ['NONE', 'HIGH_SCHOOL', 'DIPLOMA', 'BACHELORS', 'MASTERS', 'PHD'] as const
export const SALARY_CURRENCIES = ['PKR', 'AED', 'USD', 'GBP', 'EUR'] as const

export const EDUCATION_LABEL: Record<string, string> = {
  NONE: 'No requirement',
  HIGH_SCHOOL: 'High school',
  DIPLOMA: 'Diploma',
  BACHELORS: "Bachelor's",
  MASTERS: "Master's",
  PHD: 'PhD',
}

/** FULL_TIME → Full Time. */
export function humanise(s: string): string {
  return s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

function parseJson(raw: string | null | undefined): unknown {
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

// ─── The job ────────────────────────────────────────────────────────────────

export type SectionKey = 'summary' | 'responsibilities' | 'requirements' | 'niceToHave' | 'benefits'

export interface JdSections {
  summary: string
  responsibilities: string[]
  requirements: string[]
  niceToHave: string[]
  benefits: string[]
}

export const EMPTY_SECTIONS: JdSections = {
  summary: '', responsibilities: [], requirements: [], niceToHave: [], benefits: [],
}

export const SECTION_LABELS: Record<SectionKey, string> = {
  summary: 'Description',
  responsibilities: 'Responsibilities',
  requirements: 'Requirements',
  niceToHave: 'Nice to have',
  benefits: 'Benefits',
}

/** One item per line. Pasted bullets and numbers lose their markers. */
export function listFromText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter(Boolean)
}

function sanitizeList(v: unknown, max = 40): string[] {
  const items = Array.isArray(v)
    ? v.map((x) => String(x ?? '').trim())
    : typeof v === 'string' ? listFromText(v) : []
  return items.filter(Boolean).map((s) => s.slice(0, 400)).slice(0, max)
}

export function sanitizeSections(input: unknown): JdSections {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  return {
    summary: String(o.summary ?? '').trim().slice(0, 4000),
    responsibilities: sanitizeList(o.responsibilities),
    requirements: sanitizeList(o.requirements),
    niceToHave: sanitizeList(o.niceToHave),
    benefits: sanitizeList(o.benefits),
  }
}

/** Null for a job written before the editor, which has only its markdown. */
export function parseSections(raw: string | null | undefined): JdSections | null {
  const v = parseJson(raw)
  return v ? sanitizeSections(v) : null
}

export interface JobBasics {
  title: string
  departmentName?: string | null
  positionLevel?: string | null
  type: string
  vacancies: number
  location?: string | null
  isRemote?: boolean
  minExperienceYears?: number | null
  educationLevel?: string | null
  salaryMin?: number | null
  salaryMax?: number | null
  salaryCurrency?: string | null
  closingDate?: string | Date | null
}

function experienceLine(years: number): string {
  return years < 1
    ? `${Math.round(years * 12)}+ months of relevant experience`
    : `${years}+ years of relevant experience`
}

/**
 * The published job description, assembled from the editor's boxes. The
 * careers page renders this, so what the preview shows is what applicants read.
 */
export function composeJdContent(job: JobBasics, s: JdSections): string {
  const L: string[] = []
  L.push(`# ${job.title.trim() || 'Untitled role'}`)
  const meta = [
    job.departmentName,
    job.positionLevel ? humanise(job.positionLevel) : null,
    humanise(job.type),
    job.isRemote ? 'Remote' : job.location,
  ].filter(Boolean)
  if (meta.length) L.push(`**${meta.join(' · ')}**`)
  if (job.vacancies > 1) L.push(`**Openings:** ${job.vacancies}`)
  L.push('')

  if (s.summary.trim()) L.push('## About the Role', s.summary.trim(), '')
  if (s.responsibilities.length) {
    L.push('## What You Will Do', ...s.responsibilities.map((r) => `- ${r}`), '')
  }
  const reqs = [...s.requirements]
  if (job.minExperienceYears) reqs.push(experienceLine(job.minExperienceYears))
  if (job.educationLevel && job.educationLevel !== 'NONE') {
    reqs.push(`${EDUCATION_LABEL[job.educationLevel] ?? humanise(job.educationLevel)} degree or equivalent`)
  }
  if (reqs.length) L.push('## Requirements', ...reqs.map((r) => `- ${r}`), '')
  if (s.niceToHave.length) L.push('## Nice to Have', ...s.niceToHave.map((r) => `- ${r}`), '')

  const cur = job.salaryCurrency || 'PKR'
  if (job.salaryMin || job.salaryMax) {
    const range = job.salaryMin && job.salaryMax
      ? `${cur} ${job.salaryMin.toLocaleString('en-US')} – ${job.salaryMax.toLocaleString('en-US')}`
      : `${cur} ${(job.salaryMin || job.salaryMax)!.toLocaleString('en-US')}`
    L.push(`**Compensation:** ${range} per month`, '')
  }
  if (s.benefits.length) L.push('## Benefits', ...s.benefits.map((r) => `- ${r}`), '')

  if (job.closingDate) {
    const d = new Date(job.closingDate)
    if (!isNaN(d.getTime())) {
      L.push(`**Applications close:** ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}`)
    }
  }
  return L.join('\n').trim()
}

/** What still has to be written before the job can go out, in the editor's words. */
export function missingForPublish(job: { title: string; departmentId: string | null }, s: JdSections): string[] {
  const out: string[] = []
  if (job.title.trim().length < 2) out.push('Job title')
  if (!job.departmentId) out.push('Department')
  if (s.summary.trim().length < 20) out.push('Description')
  if (s.responsibilities.length === 0) out.push('Responsibilities')
  if (s.requirements.length === 0) out.push('Requirements')
  return out
}

function classifyHeading(h: string): SectionKey | null {
  const t = h.toLowerCase()
  if (/nice to have|preferred|good to have|bonus/.test(t)) return 'niceToHave'
  if (/responsib|what you('|’)?ll do|what you will do|duties|day to day/.test(t)) return 'responsibilities'
  if (/benefit|what we offer|perks|why join/.test(t)) return 'benefits'
  if (/require|qualif|must|skills|who you are/.test(t)) return 'requirements'
  if (/about|description|overview|summary|the role/.test(t)) return 'summary'
  return null
}

/**
 * A past job description cut back into the editor's sections, so its lines can
 * be ticked and imported. Understands both the editor's own headings and the
 * generated ones ("Key Responsibilities", "Preferred Qualifications").
 */
export function splitJdIntoSections(md: string | null | undefined): JdSections {
  const out: JdSections = { summary: '', responsibilities: [], requirements: [], niceToHave: [], benefits: [] }
  const paragraphs: string[] = []
  let bucket: SectionKey | null = null
  let para: string[] = []
  const clean = (s: string) => s.replace(/\*\*|__/g, '').trim()
  const flush = () => {
    if (bucket === 'summary' && para.length) paragraphs.push(para.join(' '))
    para = []
  }

  for (const raw of (md ?? '').split(/\r?\n/)) {
    const line = raw.trim()
    const heading = line.match(/^#{1,4}\s+(.*)$/)
    if (heading) { flush(); bucket = classifyHeading(heading[1]); continue }
    if (!line) { flush(); continue }
    if (!bucket) continue
    if (/^\*\*[^*]+:\*\*/.test(line)) continue // "**Openings:** 2" and the like
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/)
    const text = clean(bullet ? bullet[1] : line)
    if (!text) continue
    if (bucket === 'summary') {
      if (bullet) { flush(); paragraphs.push(text) } else para.push(text)
    } else {
      out[bucket].push(text)
    }
  }
  flush()

  const uniq = (xs: string[]) => [...new Set(xs)]
  out.responsibilities = uniq(out.responsibilities)
  out.requirements = uniq(out.requirements)
  out.niceToHave = uniq(out.niceToHave)
  out.benefits = uniq(out.benefits)
  // Summary paragraphs travel as separate lines so each can be ticked alone.
  out.summary = uniq(paragraphs).join('\n')
  return out
}

// ─── The application form ───────────────────────────────────────────────────

export type FieldMode = 'MANDATORY' | 'OPTIONAL' | 'OFF'
export const FIELD_MODES: FieldMode[] = ['MANDATORY', 'OPTIONAL', 'OFF']

export type ApplicationFieldKey =
  | 'phone' | 'location'
  | 'currentCompany' | 'currentRole' | 'experience' | 'educationLevel' | 'cvUrl' | 'skills' | 'languages'
  | 'workAuthorization' | 'openToRemote' | 'expectedSalary' | 'noticePeriod' | 'notes'

export interface ApplicationField {
  key: ApplicationFieldKey
  label: string
  group: 'Personal information' | 'Profile' | 'Details'
  /** A tickbox cannot be mandatory — ticking it would be the only answer. */
  modes?: FieldMode[]
}

export const APPLICATION_FIELDS: ApplicationField[] = [
  { key: 'phone', label: 'Phone', group: 'Personal information' },
  { key: 'location', label: 'City', group: 'Personal information' },
  { key: 'currentCompany', label: 'Current company', group: 'Profile' },
  { key: 'currentRole', label: 'Current role', group: 'Profile' },
  { key: 'experience', label: 'Years of experience', group: 'Profile' },
  { key: 'educationLevel', label: 'Education', group: 'Profile' },
  { key: 'cvUrl', label: 'CV / portfolio link', group: 'Profile' },
  { key: 'skills', label: 'Key skills', group: 'Profile' },
  { key: 'languages', label: 'Languages', group: 'Profile' },
  { key: 'workAuthorization', label: 'Right to work', group: 'Details' },
  { key: 'openToRemote', label: 'Open to remote work', group: 'Details', modes: ['OPTIONAL', 'OFF'] },
  { key: 'expectedSalary', label: 'Expected salary', group: 'Details' },
  { key: 'noticePeriod', label: 'Notice period', group: 'Details' },
  { key: 'notes', label: 'Why this role?', group: 'Details' },
]

/** The form every job had before it could be changed: everything shown, nothing required. */
export const DEFAULT_APPLICATION_FIELDS: Record<ApplicationFieldKey, FieldMode> = {
  phone: 'OPTIONAL', location: 'OPTIONAL',
  currentCompany: 'OPTIONAL', currentRole: 'OPTIONAL', experience: 'OPTIONAL',
  educationLevel: 'OPTIONAL', cvUrl: 'OPTIONAL', skills: 'OPTIONAL', languages: 'OPTIONAL',
  workAuthorization: 'OPTIONAL', openToRemote: 'OPTIONAL',
  expectedSalary: 'OFF', noticePeriod: 'OFF', notes: 'OPTIONAL',
}

/**
 * Which application field each knockout filter reads. A hard filter on a field
 * the form does not ask would fail every applicant, so the editor will not let
 * that field be switched off.
 */
export const KNOCKOUT_FIELD: Record<string, ApplicationFieldKey> = {
  WORK_AUTH: 'workAuthorization',
  LOCATION: 'location',
  SKILL: 'skills',
  MIN_YEARS: 'experience',
  MIN_EDUCATION: 'educationLevel',
  LANGUAGE: 'languages',
}

export type QuestionType = 'TEXT' | 'YES_NO' | 'NUMBER'
export const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'TEXT', label: 'Short answer' },
  { value: 'YES_NO', label: 'Yes / No' },
  { value: 'NUMBER', label: 'Number' },
]

export interface ApplicationQuestion {
  id: string
  text: string
  type: QuestionType
  required: boolean
}

export interface ApplicationFormConfig {
  fields: Record<ApplicationFieldKey, FieldMode>
  questions: ApplicationQuestion[]
}

export function newQuestionId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function sanitizeApplicationFields(input: unknown): Record<ApplicationFieldKey, FieldMode> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const fields = { ...DEFAULT_APPLICATION_FIELDS }
  for (const f of APPLICATION_FIELDS) {
    const mode = o[f.key] as FieldMode
    if ((f.modes ?? FIELD_MODES).includes(mode)) fields[f.key] = mode
  }
  return fields
}

export function sanitizeApplicationForm(input: unknown): ApplicationFormConfig {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const questions = (Array.isArray(o.questions) ? o.questions : [])
    .map((q): ApplicationQuestion | null => {
      const r = q && typeof q === 'object' ? (q as Record<string, unknown>) : {}
      const text = String(r.text ?? '').trim().slice(0, 300)
      if (!text) return null
      const type = QUESTION_TYPES.some((t) => t.value === r.type) ? (r.type as QuestionType) : 'TEXT'
      return { id: String(r.id || newQuestionId()).slice(0, 20), text, type, required: !!r.required }
    })
    .filter((q): q is ApplicationQuestion => q !== null)
    .slice(0, 20)
  return { fields: sanitizeApplicationFields(o.fields), questions }
}

export function parseApplicationForm(raw: string | null | undefined): ApplicationFormConfig {
  const v = parseJson(raw)
  return v ? sanitizeApplicationForm(v) : { fields: { ...DEFAULT_APPLICATION_FIELDS }, questions: [] }
}

// ─── The workflow ───────────────────────────────────────────────────────────

/** Every job moves through the same stages, so the board can compare jobs. */
export const JOB_STAGES = [
  { key: 'APPLIED', label: 'Applied' },
  { key: 'SCREENING', label: 'Screening' },
  { key: 'INTERVIEW', label: 'Interview' },
  { key: 'OFFER', label: 'Offer' },
  { key: 'HIRED', label: 'Hired' },
] as const

export const INTERVIEW_TYPES = [
  { value: 'PHONE', label: 'Phone screen' },
  { value: 'VIDEO', label: 'Video interview' },
  { value: 'TECHNICAL', label: 'Technical' },
  { value: 'HR', label: 'HR conversation' },
  { value: 'ONSITE', label: 'Onsite (final)' },
]

export interface InterviewRound {
  name: string
  type: string
}

export function sanitizeRounds(input: unknown): InterviewRound[] {
  return (Array.isArray(input) ? input : [])
    .map((r): InterviewRound | null => {
      const o = r && typeof r === 'object' ? (r as Record<string, unknown>) : {}
      const name = String(o.name ?? '').trim().slice(0, 80)
      if (!name) return null
      const type = INTERVIEW_TYPES.some((t) => t.value === o.type) ? String(o.type) : 'VIDEO'
      return { name, type }
    })
    .filter((r): r is InterviewRound => r !== null)
    .slice(0, 10)
}

export function parseRounds(raw: string | null | undefined): InterviewRound[] {
  return sanitizeRounds(parseJson(raw))
}

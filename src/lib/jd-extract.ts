/**
 * Read a job description file and fill in the job post form from it — the
 * JD counterpart of reading a CV into a candidate.
 *
 * PDFs go to Claude as a document block, so layout, tables and bullets are
 * read as they print. A Word .docx is unzipped to its text with mammoth (the
 * old bulk route read .docx bytes as text, which is a zip archive and never
 * worked). Plain text and Markdown are read as they are.
 *
 * The answer is constrained to a JSON schema (structured outputs) shaped like
 * the editor's first step, so enums come back as the form's own values, and
 * everything is checked again here before it reaches the form.
 */
import Anthropic from '@anthropic-ai/sdk'
import { EDUCATION_LEVELS, EMPLOYMENT_TYPES, LEVELS, SALARY_CURRENCIES } from '@/lib/job-post'

export class JdExtractError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

/** What the file said, in the editor's terms. Null or empty where it said nothing. */
export interface ParsedJobPost {
  title: string | null
  department: string | null
  positionLevel: (typeof LEVELS)[number] | null
  type: (typeof EMPLOYMENT_TYPES)[number] | null
  vacancies: number | null
  location: string | null
  isRemote: boolean | null
  minExperienceYears: number | null
  educationLevel: (typeof EDUCATION_LEVELS)[number] | null
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency: (typeof SALARY_CURRENCIES)[number] | null
  closingDate: string | null
  summary: string | null
  responsibilities: string[]
  requirements: string[]
  niceToHave: string[]
  benefits: string[]
}

const MAX_BYTES = 10 * 1024 * 1024

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] })
const list = { type: 'array', items: { type: 'string' } }

function schemaFor(departments: string[]) {
  const properties = {
    title: nullable({ type: 'string' }),
    department: nullable(departments.length ? { type: 'string', enum: departments } : { type: 'string' }),
    positionLevel: nullable({ type: 'string', enum: [...LEVELS] }),
    type: nullable({ type: 'string', enum: [...EMPLOYMENT_TYPES] }),
    vacancies: nullable({ type: 'integer' }),
    location: nullable({ type: 'string' }),
    isRemote: nullable({ type: 'boolean' }),
    minExperienceYears: nullable({ type: 'number' }),
    educationLevel: nullable({ type: 'string', enum: [...EDUCATION_LEVELS] }),
    salaryMin: nullable({ type: 'number' }),
    salaryMax: nullable({ type: 'number' }),
    salaryCurrency: nullable({ type: 'string', enum: [...SALARY_CURRENCIES] }),
    closingDate: nullable({ type: 'string' }),
    summary: nullable({ type: 'string' }),
    responsibilities: list,
    requirements: list,
    niceToHave: list,
    benefits: list,
  }
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  }
}

const SYSTEM =
  'You read job descriptions and fill in a job post form from them. Take every value from the ' +
  'document itself. When the document does not say something, return null (or an empty list) — ' +
  'a blank box is better than a plausible guess, because HR publishes these posts to candidates.'

function instructions(departments: string[]): string {
  return [
    'Fill in the job post form from the job description above.',
    '',
    '- title: the role as named, without salary, location, or words like "urgent" or "hiring".',
    departments.length
      ? `- department: one of ${departments.map((d) => `"${d}"`).join(', ')} — only when the role plainly belongs to it; otherwise null.`
      : '- department: the department named in the document, or null.',
    '- summary: what the role is and what a typical day looks like, as written. Plain text, paragraphs separated by a blank line. Leave out generic company boilerplate.',
    '- responsibilities, requirements, niceToHave, benefits: one item per entry, in the document\'s words, without bullet symbols or numbering. Requirements are the must-haves (skills, experience, qualifications); niceToHave are the preferred or bonus ones.',
    '- positionLevel, type, educationLevel, salaryCurrency: pick the listed value the document states or plainly implies; otherwise null.',
    '- vacancies: the number of openings, only if stated.',
    '- location: the city or office. isRemote: true only if the whole job can be done remotely; false if it says on-site or hybrid; null if it does not say.',
    '- minExperienceYears: the minimum years asked for ("3+ years" is 3), or null.',
    '- salaryMin, salaryMax: the monthly salary as plain numbers. If only an annual figure is given, divide it by 12. If one figure is given, use it for both. Null when no figure is given ("competitive" is not a figure).',
    '- closingDate: the application deadline as YYYY-MM-DD, only when a full date is stated.',
  ].join('\n')
}

async function fileBlock(bytes: Buffer, filename: string, mimeType: string): Promise<Anthropic.ContentBlockParam> {
  const ext = filename.toLowerCase().split('.').pop() ?? ''
  const mime = mimeType.toLowerCase()

  if (ext === 'pdf' || mime === 'application/pdf') {
    return {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: bytes.toString('base64') },
    }
  }

  let text: string
  if (ext === 'docx' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mammoth = await import('mammoth')
    text = (await mammoth.extractRawText({ buffer: bytes })).value
  } else if (ext === 'txt' || ext === 'md' || mime.startsWith('text/')) {
    text = bytes.toString('utf-8')
  } else if (ext === 'doc') {
    throw new JdExtractError('Old Word .doc files cannot be read. Save it as .docx or PDF and upload that.')
  } else {
    throw new JdExtractError('Upload a PDF, a Word .docx or a text file.')
  }

  if (text.trim().length < 50) {
    throw new JdExtractError('That file has almost no text in it — it may be a scan. Upload the PDF or Word version instead.')
  }
  return { type: 'text', text: `<job_description>\n${text}\n</job_description>` }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)
const items = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string').map((x) => x.replace(/^\s*(?:[-•*·▪]|\d+[.)])\s*/, '').trim()).filter(Boolean)
    : []
function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null
}

/** The schema constrains the reply; this makes sure of it before the form trusts it. */
function sanitize(raw: Record<string, unknown>, departments: string[]): ParsedJobPost {
  const department = str(raw.department)
  const closingDate = str(raw.closingDate)
  const vacancies = num(raw.vacancies)
  return {
    title: str(raw.title),
    department: department
      ? departments.length
        ? departments.find((d) => d.toLowerCase() === department.toLowerCase()) ?? null
        : department
      : null,
    positionLevel: oneOf(raw.positionLevel, LEVELS),
    type: oneOf(raw.type, EMPLOYMENT_TYPES),
    vacancies: vacancies !== null && Number.isInteger(vacancies) && vacancies >= 1 ? vacancies : null,
    location: str(raw.location),
    isRemote: typeof raw.isRemote === 'boolean' ? raw.isRemote : null,
    minExperienceYears: num(raw.minExperienceYears),
    educationLevel: oneOf(raw.educationLevel, EDUCATION_LEVELS),
    salaryMin: num(raw.salaryMin),
    salaryMax: num(raw.salaryMax),
    salaryCurrency: oneOf(raw.salaryCurrency, SALARY_CURRENCIES),
    closingDate: closingDate && /^\d{4}-\d{2}-\d{2}$/.test(closingDate) ? closingDate : null,
    summary: str(raw.summary),
    responsibilities: items(raw.responsibilities),
    requirements: items(raw.requirements),
    niceToHave: items(raw.niceToHave),
    benefits: items(raw.benefits),
  }
}

export async function extractJobPost({ bytes, filename, mimeType, departments }: {
  bytes: Buffer
  filename: string
  mimeType: string
  /** The department names the form offers, so the answer is one of them. */
  departments: string[]
}): Promise<ParsedJobPost> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new JdExtractError('Reading job descriptions needs ANTHROPIC_API_KEY on this deployment.', 503)
  }
  if (bytes.length === 0) throw new JdExtractError('That file is empty.')
  if (bytes.length > MAX_BYTES) {
    throw new JdExtractError(`That file is ${(bytes.length / 1024 / 1024).toFixed(1)}MB — the limit is 10MB.`)
  }

  const block = await fileBlock(bytes, filename, mimeType)
  const client = new Anthropic()

  let message: Anthropic.Message
  try {
    message = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { format: { type: 'json_schema', schema: schemaFor(departments) } },
      messages: [{ role: 'user', content: [block, { type: 'text', text: instructions(departments) }] }],
    })
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      throw new JdExtractError('Too many files are being read right now. Try again in a minute.', 429)
    }
    if (err instanceof Anthropic.BadRequestError) {
      throw new JdExtractError('That file could not be read. Try saving it as a PDF and uploading again.', 400)
    }
    if (err instanceof Anthropic.APIError) {
      throw new JdExtractError('The reader is unavailable right now. Try again shortly.', 502)
    }
    throw err
  }

  if (message.stop_reason === 'refusal') {
    throw new JdExtractError('This file could not be read as a job description.', 422)
  }
  if (message.stop_reason === 'max_tokens') {
    throw new JdExtractError('That document is too long to read in one go. Upload just the job description.', 422)
  }

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new JdExtractError('The file was read, but the answer came back unusable. Try again.', 502)
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new JdExtractError('The file was read, but the answer came back unusable. Try again.', 502)
  }
  return sanitize(raw as Record<string, unknown>, departments)
}

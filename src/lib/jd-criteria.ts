/**
 * Read a job description and propose knockout filters from it.
 *
 * The old suggester was eight hardcoded keywords that returned at most one
 * filter, so the Knockout Filters dialog opened on an empty Skill row for a QA
 * JD that names Selenium, Cypress, Playwright, Postman, Git, Jira, SQL, CI/CD,
 * Agile, a years figure and a degree. Everything below is read out of the JD
 * text; nothing is invented.
 *
 * Two decisions worth stating:
 *
 *   Skills come back SOFT. A hard filter auto-rejects at intake, so seven of
 *   them off one "Skills Required" list would drop every applicant into the
 *   Knockouts tab and leave the pipeline empty. Each row shows the section it
 *   came from, and HR ticks Hard on the ones that genuinely gate. Years and
 *   education come back hard, because those are the objective gates — unless
 *   the JD itself softens the degree with "or equivalent".
 *
 *   Alternatives stay together. "Selenium, Cypress, or Playwright" is one
 *   requirement with three ways to satisfy it, so it becomes a single filter
 *   "Selenium | Cypress | Playwright" that passes on any of them. Emitting
 *   three separate filters would demand all three.
 */

export type JdCriterionType =
  | 'SKILL' | 'MIN_YEARS' | 'MIN_EDUCATION' | 'LOCATION' | 'LANGUAGE'

export interface JdCriterion {
  type: JdCriterionType
  value: string
  isHard: boolean
  /** Where in the JD it was found — shown so HR can judge the suggestion. */
  source: string
}

/** Skills that a JD offers as alternatives. Members join into one filter. */
const SKILL_GROUPS: Array<{ group: string; members: string[] }> = [
  { group: 'test automation', members: ['Selenium', 'Cypress', 'Playwright', 'WebdriverIO', 'Puppeteer', 'TestCafe', 'Appium'] },
  { group: 'API testing',     members: ['Postman', 'JMeter', 'SoapUI', 'Insomnia', 'Swagger'] },
  { group: 'version control', members: ['Git', 'GitHub', 'GitLab', 'Bitbucket'] },
  { group: 'issue tracking',  members: ['Jira', 'Trello', 'Asana', 'ClickUp', 'Linear', 'Monday.com'] },
  { group: 'analytics',       members: ['GA4', 'Google Analytics', 'Mixpanel', 'Amplitude'] },
  { group: 'session replay',  members: ['Hotjar', 'Clarity', 'FullStory', 'Lucky Orange'] },
  { group: 'A/B testing',     members: ['VWO', 'Optimizely', 'Convert', 'Google Optimize', 'AB Tasty', 'Intelligems', 'ABConvert'] },
  { group: 'lifecycle marketing', members: ['Klaviyo', 'Postscript', 'Attentive', 'Mailchimp', 'Yotpo'] },
  { group: 'design tools',    members: ['Figma', 'Sketch', 'Adobe XD', 'Photoshop', 'Illustrator', 'InDesign', 'After Effects'] },
  { group: 'paid ads',        members: ['Meta Ads', 'Facebook Ads', 'Google Ads', 'TikTok Ads', 'Snapchat Ads'] },
  { group: 'frontend',        members: ['React', 'Vue', 'Angular', 'Next.js', 'Svelte'] },
  { group: 'backend',         members: ['Node.js', 'Django', 'Laravel', 'Rails', 'Express', '.NET', 'Flask'] },
  { group: 'ecommerce platform', members: ['Shopify', 'Shopify Plus', 'WooCommerce', 'Magento', 'BigCommerce', 'Liquid'] },
  { group: 'CI/CD',           members: ['CI/CD', 'Jenkins', 'GitHub Actions', 'CircleCI', 'Travis CI'] },
  { group: 'containers',      members: ['Docker', 'Kubernetes'] },
  { group: 'agile practice',  members: ['Agile', 'Scrum', 'Kanban'] },
  { group: 'AI tooling',      members: ['TensorFlow', 'PyTorch', 'LangChain', 'Hugging Face', 'OpenAI API', 'Scikit-learn'] },
  { group: 'accounting',      members: ['QuickBooks', 'Xero', 'SAP', 'Tally', 'Oracle Financials'] },
  { group: 'spreadsheets',    members: ['Excel', 'Google Sheets'] },
  { group: 'CRM',             members: ['HubSpot', 'Salesforce', 'Pipedrive', 'Zoho'] },
]

/** Skills that stand on their own. */
const STANDALONE_SKILLS = [
  'SQL', 'MySQL', 'PostgreSQL', 'MongoDB', 'BigQuery',
  'Python', 'JavaScript', 'TypeScript', 'PHP', 'Java', 'C#',
  'HTML', 'CSS', 'Tailwind', 'Bootstrap',
  'REST API', 'GraphQL',
  'Prompt Engineering', 'Machine Learning', 'NLP', 'Computer Vision',
  'SEO', 'Copywriting', 'Email Marketing', 'Content Marketing',
  'Manual Testing', 'Regression Testing', 'Performance Testing', 'Test Automation',
  'CRO', 'A/B Testing', 'UI/UX', 'Wireframing', 'Prototyping',
  'Financial Modelling', 'Budgeting', 'Forecasting', 'Reconciliation',
  'Lead Generation', 'Cold Outreach', 'Negotiation',
]

const CITIES = ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar', 'Dubai']
const LANGUAGES = ['English', 'Urdu', 'Arabic', 'French', 'German', 'Spanish']

/** Headings that mark everything under them as optional rather than required. */
const SOFT_HEADING = /nice[- ]to[- ]have|good[- ]to[- ]have|preferred|bonus|desirable|optional|a plus|advantage/i

/**
 * Sections that describe the company, not the candidate. Every Convertt JD
 * opens with "a CRO and eCommerce design agency … building high-converting
 * Shopify stores", which would otherwise make CRO and Shopify look like
 * requirements on a QA role.
 */
const NOISE_HEADING =
  /^about\b|about us|about convertt|what we offer|how to apply|benefits|working hours|compensation|the company|why join/i

/**
 * Plain-text JDs run the same blurb as a paragraph with no heading above it,
 * so the line itself has to be recognised.
 */
const NOISE_LINE =
  /^about (us|the company|convertt)\b|convertt is a|we don'?t just make things look good/i

/** A language only counts when the JD asks for it, not when it mentions it. */
const LANGUAGE_CONTEXT = /fluen|proficien|communicat|written|verbal|speak|native|bilingual|command of/i

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Word-boundary match that survives dots, slashes and pluses — \b would break
 * on "Next.js", "CI/CD" and ".NET".
 */
function mentions(text: string, term: string): boolean {
  const re = new RegExp(`(?<![A-Za-z0-9])${escapeRe(term)}(?![A-Za-z0-9])`, 'i')
  return re.test(text)
}

function isHeading(line: string, previousBlank: boolean): boolean {
  const t = line.trim()
  if (!t) return false
  if (/^#{1,6}\s+\S/.test(t)) return true
  if (/^\*\*[^*]+\*\*:?$/.test(t)) return true
  // Plain-text JDs use a short bare line with a blank line above it.
  if (!previousBlank) return false
  if (t.length > 60 || t.length < 3) return false
  if (/^[-*•\d]/.test(t)) return false
  if (/[.,;!?]$/.test(t)) return false
  if (t.includes(',')) return false
  // "Job Type: Full-time Location: Lahore — on-site" is a metadata line, not a
  // heading. A real heading only carries a colon at its end.
  if (t.slice(0, -1).includes(':')) return false
  return true
}

function cleanHeading(line: string): string {
  return line.trim().replace(/^#{1,6}\s+/, '').replace(/^\*\*|\*\*:?$/g, '').replace(/:$/, '').trim()
}

/** Every line of the JD paired with the heading it sits under. */
function sectioned(jd: string): Array<{ line: string; heading: string }> {
  const lines = jd.replace(/\r\n/g, '\n').split('\n')
  const out: Array<{ line: string; heading: string }> = []
  let heading = ''
  for (let i = 0; i < lines.length; i++) {
    const previousBlank = i === 0 || lines[i - 1].trim() === ''
    if (isHeading(lines[i], previousBlank)) {
      heading = cleanHeading(lines[i])
      continue
    }
    out.push({ line: lines[i], heading })
  }
  return out
}

/**
 * Where this term appears, preferring a section about the candidate over one
 * about the company. A term mentioned *only* in the company blurb returns
 * null: "we build high-converting Shopify stores" is not a requirement.
 */
function findMention(rows: Array<{ line: string; heading: string }>, term: string) {
  for (const r of rows) {
    if (!mentions(r.line, term)) continue
    if (NOISE_HEADING.test(r.heading)) continue
    if (NOISE_LINE.test(r.line.trim())) continue
    return r
  }
  return null
}

export function extractCriteriaFromJd(jd: string): JdCriterion[] {
  if (!jd || !jd.trim()) return []
  const rows = sectioned(jd)
  const text = jd.replace(/\r\n/g, '\n')
  const out: JdCriterion[] = []

  // ── Skills, alternatives kept together ────────────────────────────────
  for (const { members } of SKILL_GROUPS) {
    const found: string[] = []
    let heading = ''
    for (const m of members) {
      const hit = findMention(rows, m)
      if (!hit) continue
      // "Shopify" and "Shopify Plus" are the same product named twice, so keep
      // the longer one. "Git" and "GitLab" are not — the test is a whole extra
      // word, not a shared prefix, or listing Git alongside GitLab would drop
      // Git entirely.
      const lower = m.toLowerCase()
      if (found.some((f) => lower.startsWith(f.toLowerCase() + ' ') === false && f.toLowerCase().startsWith(lower + ' '))) continue
      const shorter = found.findIndex((f) => lower.startsWith(f.toLowerCase() + ' '))
      if (shorter >= 0) found[shorter] = m
      else found.push(m)
      if (!heading) heading = hit.heading
    }
    if (found.length === 0) continue
    out.push({
      type: 'SKILL',
      value: found.join(' | '),
      isHard: false,
      source: heading || 'the job description',
    })
  }

  for (const skill of STANDALONE_SKILLS) {
    const hit = findMention(rows, skill)
    if (!hit) continue
    // Skip anything already covered by a group filter.
    if (out.some((c) => c.type === 'SKILL' && mentions(c.value, skill))) continue
    out.push({ type: 'SKILL', value: skill, isHard: false, source: hit.heading || 'the job description' })
  }

  // ── Minimum years ─────────────────────────────────────────────────────
  //   "1–1.5 years", "3-4 Years", "2+ years", "minimum of 3 years"
  const years = text.match(/(\d+(?:\.\d+)?)\s*(?:[-–—]\s*\d+(?:\.\d+)?\s*)?\+?\s*(?:years?|yrs?)\b/i)
  if (years) {
    const low = Math.floor(Number(years[1]))
    if (Number.isFinite(low) && low > 0 && low <= 25) {
      out.push({
        type: 'MIN_YEARS',
        value: String(low),
        isHard: true,
        source: `“${years[0].trim()}” in the JD`,
      })
    }
  }

  // ── Minimum education ─────────────────────────────────────────────────
  const degree = /\b(ph\.?d|doctorate)\b/i.test(text) ? 'PHD'
    : /\bmaster'?s?\b|\bmsc\b|\bms\b(?!\s*(office|word|excel))/i.test(text) ? 'MASTERS'
    : /\bbachelor'?s?\b|\bbsc?\b|\bbs\b|\bundergraduate degree\b/i.test(text) ? 'BACHELORS'
    : null
  if (degree) {
    // A JD that says "or equivalent practical experience" is not gating on it.
    const equivalent = /or equivalent|or relevant experience|equivalent practical/i.test(text)
    out.push({
      type: 'MIN_EDUCATION',
      value: degree,
      isHard: !equivalent,
      source: equivalent ? 'degree, softened by “or equivalent”' : 'required qualifications',
    })
  }

  // ── Location ──────────────────────────────────────────────────────────
  const cities = CITIES.filter((c) => mentions(text, c))
  if (cities.length > 0) {
    const remote = /\bremote\b|\bhybrid\b|work from home/i.test(text)
    const value = [...cities, ...(remote ? ['Remote-OK'] : [])].join(',')
    out.push({
      type: 'LOCATION',
      value,
      isHard: false,
      source: remote ? 'location, with remote mentioned' : 'location in the JD',
    })
  }

  // ── Language, only when one is actually named ─────────────────────────
  //   "Good communication skills" names no language, so it produces nothing.
  for (const lang of LANGUAGES) {
    const hit = findMention(rows, lang)
    if (!hit) continue
    // "explaining what they mean in plain English" is not a language filter.
    if (!LANGUAGE_CONTEXT.test(hit.line)) continue
    out.push({ type: 'LANGUAGE', value: lang, isHard: false, source: hit.heading || 'the job description' })
  }

  // Soft-heading override: anything sitting under "Nice to Have" is optional
  // whatever the type-level default said.
  for (const c of out) {
    if (SOFT_HEADING.test(c.source)) c.isHard = false
  }

  return out.slice(0, 16)
}

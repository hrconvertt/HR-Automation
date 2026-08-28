/**
 * Job Description auto-generator — Convertt-style.
 *
 * Mirrors the actual JD pattern Convertt uses (the same shape Stripe,
 * Figma, Linear, Vercel use):
 *
 *   We're Hiring: {Title} — {Specialty}
 *   Header block (Location · Type · Experience · Optional guardrail note)
 *   About Convertt (brand brag with real numbers)
 *   The Role (vision-led, calls out who NOT to apply)
 *   What You'll Do (role-specific bullets)
 *   What We're Looking For (required skills)
 *   Nice to Have
 *   What We Offer
 *
 * Phase A is a smart template — auto-detects seniority, role family
 * (designer / developer / marketing / business / generic), and weaves
 * in the manager's request note. Phase B will swap to a Claude API
 * call when an API key is configured, producing real LLM copy.
 */

interface JdInputs {
  title: string
  departmentName?: string | null
  type: string
  vacancies: number
  reason?: string | null
  requestNote?: string | null
  // Straight off the requisition, so the JD states what HR actually set
  // instead of a band guessed from the job title.
  minExperienceYears?: number | null
  salaryMin?: number | null
  salaryMax?: number | null
}

// ─── Helpers ────────────────────────────────────────────────────────

function detectSeniority(title: string): 'INTERN' | 'JUNIOR' | 'MID' | 'SENIOR' | 'LEAD' {
  const t = title.toLowerCase()
  if (t.includes('intern')) return 'INTERN'
  if (t.includes('lead') || t.includes('head') || t.includes('manager') || t.includes('principal') || t.includes('director')) return 'LEAD'
  if (t.includes('senior') || t.match(/\bsr\.?\b/)) return 'SENIOR'
  if (t.includes('junior') || t.match(/\bjr\.?\b/) || t.includes('associate') || t.includes('trainee')) return 'JUNIOR'
  return 'MID'
}

const EXP_LINE: Record<string, string> = {
  INTERN: 'Final-year student or recent graduate — academic projects and personal builds count',
  JUNIOR: '1–2 Years',
  MID:    '3–4 Years',
  SENIOR: '4+ Years',
  LEAD:   '6+ Years, including 2+ leading a team',
}

const TYPE_LABEL: Record<string, string> = {
  FULL_TIME:  'Full-Time',
  PART_TIME:  'Part-Time',
  INTERNSHIP: 'Internship',
  TRAINEE:    'Trainee',
  CONTRACT:   'Contract',
}

type Family = 'DESIGNER' | 'DEVELOPER' | 'MARKETING' | 'BUSINESS' | 'FINANCE' | 'OPERATIONS' | 'GENERIC'

function detectFamily(title: string): Family {
  const t = title.toLowerCase()
  if (/(designer|design|ui|ux|graphic|video|creative|illustrator)/.test(t)) return 'DESIGNER'
  if (/(developer|engineer|programmer|shopify|wordpress|frontend|backend|fullstack|qa|tester)/.test(t)) return 'DEVELOPER'
  if (/(marketing|cro|growth|content|copywriter|seo|sem|paid|media buyer|social media)/.test(t)) return 'MARKETING'
  // Finance first: 'account' would otherwise match Accounts Officer into BUSINESS
  // and hand a bookkeeper a new-business JD.
  if (/(account|finance|financial|bookkeep|audit|tax|payroll|treasur|billing)/.test(t)) return 'FINANCE'
  if (/(business|sales|client|partner|revenue|bd)/.test(t)) return 'BUSINESS'
  if (/(hr|operations|admin|finance|accountant|office|coordinator|project)/.test(t)) return 'OPERATIONS'
  return 'GENERIC'
}

// Role-family-specific specialty / tagline added to the headline.
function detectSpecialty(title: string, family: Family): string {
  const t = title.toLowerCase()
  if (family === 'DESIGNER') {
    if (t.includes('ux') || t.includes('ui')) return 'eCommerce & CRO'
    if (t.includes('graphic')) return 'Brand & Ad Creative'
    if (t.includes('video')) return 'Performance Video'
    return 'eCommerce Creative'
  }
  if (family === 'DEVELOPER') {
    if (t.includes('shopify')) return 'Shopify & Theme Engineering'
    if (t.includes('wordpress') || t.includes('wbw')) return 'WordPress & Full-Stack'
    if (t.includes('backend')) return 'Backend & APIs'
    if (t.includes('frontend')) return 'Frontend & Storefronts'
    return 'eCommerce Engineering'
  }
  if (family === 'MARKETING') {
    if (t.includes('cro')) return 'CRO & Conversion Strategy'
    if (t.includes('content')) return 'Content & Copy'
    if (t.includes('paid') || t.includes('media')) return 'Paid Media & Performance'
    return 'Growth & Marketing'
  }
  if (family === 'FINANCE') return 'Accounts & Finance'
  if (family === 'BUSINESS') return 'New-Business & Client Growth'
  if (family === 'OPERATIONS') return 'Operations & People'
  return 'Convertt Team'
}

// "Don't apply if you are X" guardrail line for high-volume roles.
function detectGuardrail(title: string, family: Family): string | null {
  const t = title.toLowerCase()
  if (family === 'DESIGNER' && (t.includes('ux') || t.includes('ui'))) {
    return 'Note: Product Designers must not apply as this role is strictly for UI/UX Designers with strong experience in eCommerce & CRO.'
  }
  if (family === 'DEVELOPER' && t.includes('shopify')) {
    return 'Note: Generalist full-stack developers without Shopify experience should not apply.'
  }
  if (family === 'MARKETING' && t.includes('cro')) {
    return 'Note: This role is hands-on CRO/strategy — pure content marketers may not be the right fit.'
  }
  return null
}

// ─── Role-specific "What You'll Do" / "Looking For" blocks ──────────

const RESPONSIBILITIES: Record<Family, string[]> = {
  FINANCE: [
    'Record daily financial transactions and maintain general ledger entries in accounting software.',
    'Manage accounts payable and receivable — issue client invoices, follow up on outstanding payments, and process vendor payments.',
    'Perform bank reconciliations and maintain petty cash records.',
    'Maintain organised documentation of bills, vouchers, receipts and supporting records.',
    'Assist in month-end and year-end closing activities, including trial balance preparation.',
    'Support payroll processing — salary sheets, deductions and disbursement records.',
    'Handle tax-related tasks such as withholding tax deductions and assist with monthly/annual filings (FBR, PRA).',
    'Track company expenses and flag discrepancies or unusual variances to management.',
    'Prepare basic financial summaries and reports as required by management.',
    'Coordinate with external auditors and assist during audit preparation.',
    'Ensure compliance with company financial policies and internal controls.',
  ],
  DESIGNER: [
    'Design high-converting e-commerce storefronts, product pages, and campaign landing pages from scratch',
    'Collaborate with CRO strategists to translate data insights and A/B test hypotheses into design changes',
    'Create mobile-first, pixel-perfect UI that developers can build directly from',
    'Produce multiple design variants for A/B and multivariate testing',
    'Conduct UX audits of existing client stores, identifying friction points in the checkout funnel',
    'Design ad creatives and visual assets aligned with each brand\'s identity',
    'Maintain fast turnaround times while keeping quality high — speed matters here',
  ],
  DEVELOPER: [
    'Build high-performance Shopify storefronts, custom themes, and dynamic landing pages',
    'Convert designs into pixel-perfect, mobile-first front-end code',
    'Implement CRO experiments — A/B tests, multivariate tests, and personalisation logic',
    'Optimise site speed, Core Web Vitals, and conversion-critical interactions',
    'Integrate third-party apps (analytics, ESP, reviews, subscriptions) and write clean Liquid',
    'Debug live production stores under pressure when revenue is on the line',
    'Document your work so the next developer doesn\'t have to reverse-engineer it',
  ],
  MARKETING: [
    'Run CRO experiments end-to-end — hypothesis, variant brief, launch, analyse, document',
    'Own the conversion funnel for assigned clients: top-of-page hero → add-to-cart → checkout',
    'Read heatmaps, session recordings, and GA4 funnels to find the next experiment',
    'Write briefs that designers and developers can execute without back-and-forth',
    'Report monthly performance to clients with a clear narrative (not just dashboards)',
    'Stay current with what\'s working in DTC — newsletters, Twitter, conference talks',
    'Push for the test that moves revenue, not the one that\'s easy to ship',
  ],
  BUSINESS: [
    'Drive outbound to qualified DTC brands across the US, EU, and Gulf markets',
    'Own discovery calls — diagnose conversion problems live, not from a script',
    'Close 5-figure project contracts and retain accounts for 6+ months',
    'Coordinate with delivery teams to ensure scoped work matches what was sold',
    'Track pipeline rigorously in our CRM, with realistic forecasts',
    'Represent Convertt at virtual + in-person industry events',
    'Bring insights back from the market that shape what we build internally',
  ],
  OPERATIONS: [
    'Own the day-to-day systems that keep Convertt running predictably',
    'Identify friction in our internal workflows and eliminate it',
    'Document processes so the company doesn\'t depend on tribal knowledge',
    'Coordinate cross-functionally — design, dev, accounts, and client services',
    'Use AI tools to automate repetitive work where it makes sense',
    'Maintain a quiet, fair, professional standard people want to work in',
    'Bring up problems early — surprises hurt more than uncomfortable conversations',
  ],
  GENERIC: [
    'Own your domain end-to-end with minimal supervision once you\'re ramped up',
    'Collaborate cross-functionally with design, dev, CRO, and account teams',
    'Document your work and decisions clearly so others can pick up where you left off',
    'Take feedback well and give it constructively',
    'Continuously improve our process where you see clear gains',
    'Maintain quality and speed in equal measure — both matter',
  ],
}

const LOOKING_FOR: Record<Family, string[]> = {
  FINANCE: [
    'Bachelor’s degree in Commerce, Accounting, Finance or a related field (B.Com, BBA, ACCA/CA-Inter part-qualified also welcome).',
    'Solid understanding of basic accounting principles, ledgers and reconciliations.',
    'Proficiency in Microsoft Excel (formulas, pivot tables, data organisation).',
    'Hands-on experience with accounting software (QuickBooks, Xero, Zoho Books or similar).',
    'High attention to detail and accuracy in data entry and record-keeping.',
    'Ability to manage deadlines and handle routine tasks independently.',
    'Good communication and coordination skills.',
  ],
  DESIGNER: [
    'A strong portfolio of eCommerce or DTC projects',
    'Proven experience designing specifically for Shopify — themes, sections, and landing pages',
    'Deep understanding of CRO principles: hierarchy, trust signals, urgency, social proof, CTAs',
    'Proficiency in Figma (component libraries, auto-layout, prototyping)',
    'Mobile-first mindset — you design for the phone before the desktop',
    'Ability to interpret heatmaps, session recordings, or funnel analytics and respond in design',
    'Fast executor — comfortable delivering quality work under tight timelines',
    'Strong communication skills; able to present and explain design decisions clearly',
  ],
  DEVELOPER: [
    'Proven Shopify or WordPress experience (Liquid, theme dev, custom sections, app integrations)',
    'Strong HTML, CSS, JavaScript fundamentals — vanilla JS comfort, not just React-glue',
    'Mobile-first responsive development — Core Web Vitals matter to you',
    'Comfort working from designs in Figma; you can spot when a design won\'t work technically',
    'Git fluency (branches, PRs, code review, rebasing)',
    'Bias for shipping — you ship correct code fast, then iterate',
    'Strong written communication for async work',
  ],
  MARKETING: [
    'Hands-on CRO experience — you\'ve run real experiments, not just read about them',
    'Comfort with GA4, Hotjar/Clarity, A/B test tooling (Convert, VWO, Optimize)',
    'Strong copywriting instincts — you can write a headline, not just brief one',
    'Comfortable reading data tables and explaining what they mean in plain English',
    'Excellent written briefs that don\'t require follow-up questions',
    'Bias to act on the leading signal, not wait for statistical perfection',
    'A point of view on conversion that you can defend in a meeting',
  ],
  BUSINESS: [
    'Track record selling B2B services or SaaS to global clients (US/EU/Gulf preferred)',
    'Comfort running discovery calls live, in English, with senior stakeholders',
    'Pipeline discipline — you keep CRM clean and your forecasts honest',
    'Strong writing — proposals, emails, follow-ups all need to land',
    'Process-oriented but flexible when a deal needs lateral thinking',
    'Sense of urgency that doesn\'t turn into pushiness',
  ],
  OPERATIONS: [
    'Strong organisational and systems-thinking instincts',
    'Comfort with spreadsheets, project tools (Asana/Notion/Linear), and basic SQL/scripts a plus',
    'Excellent written communication — you draft cleanly the first time',
    'Quiet, fair, low-drama posture — operations is the spine of the company',
    'Comfort raising hard topics early',
    'Self-starter — you don\'t wait to be told there\'s a problem',
  ],
  GENERIC: [
    'Strong fundamentals in your craft (we\'ll go deep in the interview)',
    'Excellent written communication — especially over email and async docs',
    'Bias for action, paired with sensible caution',
    'Comfort being measured on outcomes, not hours',
    'Track record of delivering quality work on tight timelines',
  ],
}

const NICE_TO_HAVE: Record<Family, string[]> = {
  FINANCE: [
    'Experience in an IT services, software house or eCommerce setup.',
    'Familiarity with invoicing international clients and handling foreign currency receipts.',
    'Basic understanding of tax regulations and filing procedures in Pakistan.',
    'Working knowledge of payroll processing.',
  ],
  DESIGNER: [
    'Experience with ad creative design (Meta, Google Display)',
    'Familiarity with Shopify Liquid or basic HTML/CSS',
    'Experience running or supporting A/B tests using tools like Google Optimize, Convert, or VWO',
    'Background working in a digital agency environment',
  ],
  DEVELOPER: [
    'Shopify Plus or Hydrogen experience',
    'Headless commerce, Next.js / Remix exposure',
    'Performance optimisation tooling — Lighthouse, WebPageTest, Bundlephobia',
    'Open-source contributions',
  ],
  MARKETING: [
    'Experience with Klaviyo, Postscript, or Yotpo flows',
    'Worked across multiple DTC verticals (beauty, supplements, apparel, food)',
    'Basic SQL or BigQuery comfort for cohort analysis',
    'Published writing or speaking on conversion',
  ],
  BUSINESS: [
    'Existing network in DTC / agency ecosystem',
    'Direct experience selling to founders or marketing leaders',
    'Comfort with light contract / SOW drafting',
  ],
  OPERATIONS: [
    'Experience automating workflows with Zapier, Make, or n8n',
    'Light SQL or Looker/Sigma exposure',
    'Prior agency operations background',
  ],
  GENERIC: [
    'Prior work in a fast-moving SMB or agency',
    'Exposure to remote-first or hybrid workflows',
    'A portfolio, GitHub, or sample work we can review',
  ],
}

// ─── Generator ──────────────────────────────────────────────────────


// Opening paragraph per family. Written for the role in front of us — an
// accounts hire should not be told about CRO strategists and Shopify builds.
const INTRO: Record<Family, (title: string) => string> = {
  FINANCE: (t) => `At Convertt, we are looking for an organised and detail-oriented ${t} to manage day-to-day accounting operations and maintain accurate financial records. The ideal candidate is comfortable with bookkeeping, reconciliations, invoicing and supporting month-end closing, with a strong grip on Excel and accounting software.`,
  DESIGNER: (t) => `At Convertt, we are looking for a ${t} who can turn brand and product thinking into storefronts that convert. You will design for live eCommerce brands where every screen is measured, and your work ships to real customers rather than sitting in a portfolio.`,
  DEVELOPER: (t) => `At Convertt, we are looking for a ${t} to build and maintain high-performing eCommerce experiences. You will work on live client stores where speed, reliability and clean implementation directly affect revenue.`,
  MARKETING: (t) => `At Convertt, we are looking for a ${t} to help brands grow through sharp positioning, strong creative and measurable campaigns. You will own work that is judged on outcomes, not impressions.`,
  BUSINESS: (t) => `At Convertt, we are looking for a ${t} to build client relationships and grow our book of business. You will work closely with delivery teams so that what we promise is what we ship.`,
  OPERATIONS: (t) => `At Convertt, we are looking for a dependable ${t} to keep day-to-day operations running smoothly. The ideal candidate is organised, proactive and comfortable owning routine processes end to end.`,
  GENERIC: (t) => `At Convertt, we are looking for a capable ${t} to join our team in Lahore. The ideal candidate is organised, takes ownership of their work, and communicates clearly with the people around them.`,
}

// "What We Offer" — the finance/ops version drops the agency-portfolio pitch.
const OFFERS: Record<Family, string[]> = {
  FINANCE: [
    'Competitive salary based on experience and performance.',
    'Structured, supportive work environment with clear day-to-day ownership.',
    'Career growth path from Accounts Officer toward senior accounts and finance roles.',
    'Exposure to local and international client billing.',
    'Professional and collaborative team culture.',
    'Statutory benefits (EOBI and leave entitlements per the Convertt Leave Policy).',
  ],
  OPERATIONS: [
    'Competitive salary based on experience and performance.',
    'Clear ownership of your area with room to improve how it runs.',
    'Supportive, professional team culture.',
    'Annual increments tied to performance.',
    'Statutory benefits (EOBI and leave entitlements per the Convertt Leave Policy).',
  ],
  DESIGNER: DEFAULT_OFFERS(),
  DEVELOPER: DEFAULT_OFFERS(),
  MARKETING: DEFAULT_OFFERS(),
  BUSINESS: DEFAULT_OFFERS(),
  GENERIC: DEFAULT_OFFERS(),
}

function DEFAULT_OFFERS(): string[] {
  return [
    'Competitive salary with performance-based increments.',
    'Work on real brands with real revenue at stake — your decisions have direct impact.',
    'Fast-paced, collaborative team environment.',
    'Exposure to a growing portfolio of global DTC brands across multiple verticals.',
    'Statutory benefits (EOBI and leave entitlements per the Convertt Leave Policy).',
  ]
}

/**
 * Build the JD in the house format Convertt publishes:
 *
 *   CONVERTT / {Title} / Job Description
 *   Intro paragraph (role-specific, no agency boilerplate)
 *   Location · Employment Type · Experience · Salary
 *   Key Responsibilities
 *   Required Skills & Qualifications
 *   Preferred Qualifications (Good to Have)
 *   What We Offer
 *   How to Apply
 *
 * The old draft opened with a "$1 billion in client revenue" brag and told
 * every hire they would work alongside CRO strategists and Shopify developers
 * — true for a storefront designer, nonsense for an Accounts Officer. Copy is
 * per role family now, and the experience line comes from the requisition
 * rather than being guessed from the job title.
 */
export function generateJD(input: JdInputs): string {
  const family    = detectFamily(input.title)
  const seniority = detectSeniority(input.title)
  const typeLabel = TYPE_LABEL[input.type] ?? input.type
  const onsite    = input.type === 'INTERNSHIP' ? 'On-Site' : 'On-Site'

  // Experience: prefer what HR actually entered on the requisition; fall back
  // to the band implied by the title only when nothing was given.
  const expLine = experienceLine(input.minExperienceYears, seniority)

  const salaryLine = input.salaryMin && input.salaryMax
    ? `PKR ${input.salaryMin.toLocaleString('en-PK')} – ${input.salaryMax.toLocaleString('en-PK')} (Based on skills & experience)`
    : input.salaryMin
      ? `From PKR ${input.salaryMin.toLocaleString('en-PK')} (Based on skills & experience)`
      : 'Market competitive (Based on skills & experience)'

  const intro          = INTRO[family](input.title)
  const responsibilities = RESPONSIBILITIES[family]
  const lookingFor       = LOOKING_FOR[family]
  const niceToHave       = NICE_TO_HAVE[family]
  const offers           = OFFERS[family]

  const out: string[] = []
  out.push('# CONVERTT')
  out.push(`## ${input.title}`)
  out.push('### Job Description')
  out.push('')
  out.push(intro)
  out.push('')
  out.push('**Location:** Mega Tower, Main Boulevard Gulberg, Lahore')
  out.push(`**Employment Type:** ${typeLabel} (${onsite})`)
  out.push(`**Experience:** ${expLine}`)
  out.push(`**Salary:** ${salaryLine}`)
  if (input.vacancies > 1) out.push(`**Positions:** ${input.vacancies}`)
  out.push('')
  out.push('## Key Responsibilities')
  out.push(responsibilities.map((r) => `- ${r}`).join('\n'))
  out.push('')
  out.push('## Required Skills & Qualifications')
  out.push([`${expLine} of experience in a similar role.`, ...lookingFor].map((r) => `- ${r}`).join('\n'))
  out.push('')
  out.push('## Preferred Qualifications (Good to Have)')
  out.push(niceToHave.map((r) => `- ${r}`).join('\n'))
  out.push('')
  out.push('## What We Offer')
  out.push(offers.map((r) => `- ${r}`).join('\n'))
  out.push('')
  out.push('## How to Apply')
  out.push(`Send your resume and a brief introduction to: **hr@convertt.co**`)
  out.push('')
  out.push(`**Subject Line:** Application – ${input.title}`)

  // The manager's own note is worth keeping, but it is internal context and
  // does not belong in published copy — it goes at the end, clearly marked.
  if (input.requestNote?.trim()) {
    out.push('')
    out.push('---')
    out.push(`*Internal note from the hiring manager: ${input.requestNote.trim()}*`)
  }

  return out.join('\n')
}

/** Experience wording — driven by the requisition when HR supplied a figure. */
function experienceLine(min: number | null | undefined, seniority: string): string {
  if (min == null) return EXP_LINE[seniority] ?? '1–2 Years'
  if (min <= 0) return 'Open to entry level'
  // Halves read as months, which is how the requirement is actually written:
  // 0.5 is "6 months to 1 year", not "0.5+ years".
  if (min === 0.5) return '6 months – 1 year'
  if (min === 1) return '1 Year'
  if (!Number.isInteger(min)) {
    const months = Math.round((min % 1) * 12)
    return `${Math.floor(min)} years ${months} months+`
  }
  return `${min}+ Years`
}

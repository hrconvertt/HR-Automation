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

type Family = 'DESIGNER' | 'DEVELOPER' | 'MARKETING' | 'BUSINESS' | 'OPERATIONS' | 'GENERIC'

function detectFamily(title: string): Family {
  const t = title.toLowerCase()
  if (/(designer|design|ui|ux|graphic|video|creative|illustrator)/.test(t)) return 'DESIGNER'
  if (/(developer|engineer|programmer|shopify|wordpress|frontend|backend|fullstack|qa|tester)/.test(t)) return 'DEVELOPER'
  if (/(marketing|cro|growth|content|copywriter|seo|sem|paid|media buyer|social media)/.test(t)) return 'MARKETING'
  if (/(business|sales|account|client|partner|revenue|bd)/.test(t)) return 'BUSINESS'
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

export function generateJD(input: JdInputs): string {
  const seniority = detectSeniority(input.title)
  const family    = detectFamily(input.title)
  const specialty = detectSpecialty(input.title, family)
  const guardrail = detectGuardrail(input.title, family)
  const typeLabel = TYPE_LABEL[input.type] ?? input.type
  const expLine   = EXP_LINE[seniority]

  const reasonLine = input.reason === 'GROWTH'
    ? 'expanding the team'
    : input.reason === 'REPLACEMENT'
      ? 'a replacement role'
      : input.reason === 'BACKFILL'
        ? 'a backfill role'
        : 'a strategic addition'

  const responsibilities = RESPONSIBILITIES[family]
  const lookingFor       = LOOKING_FOR[family]
  const niceToHave       = NICE_TO_HAVE[family]

  return `# We're Hiring: ${input.title} — ${specialty}

**Location:** Mega Tower, Main Boulevard Gulberg, Lahore (On-Site)

**Type:** ${typeLabel}

**Experience:** ${expLine}

${guardrail ? `> **${guardrail}**\n` : ''}

## About Convertt

Convertt is a fast-growing CRO and eCommerce design agency that has driven **over $1 billion in client revenue** across **310+ projects** worldwide. We work with DTC brands globally — from UAE to the US — building high-converting Shopify stores, landing pages, and full-stack eCommerce experiences using top global talent and AI-powered workflows.

We don't just make things look good. **We make things sell.**

## The Role

We're hiring **${input.vacancies} ${typeLabel} ${input.title}${input.vacancies > 1 ? 's' : ''}** for ${input.departmentName || 'our team'}. This is ${reasonLine}.
${input.requestNote ? `\n${input.requestNote}\n` : ''}
You'll work directly with our CRO strategists, designers, and Shopify developers on live client projects across beauty, supplements, food & beverage, apparel, and more. You won't be polishing pet projects — every deliverable touches real revenue.

## What You'll Do

${responsibilities.map((r) => `- ${r}`).join('\n')}

## What We're Looking For

- **${expLine}** of relevant experience
${lookingFor.map((r) => `- ${r}`).join('\n')}

## Nice to Have

${niceToHave.map((r) => `- ${r}`).join('\n')}

## What We Offer

- Competitive salary with performance-based bonuses
- Work on real brands with real revenue at stake — your designs and decisions have direct impact
- Fast-paced, collaborative team environment powered by AI workflows
- Access to a growing portfolio of global DTC brands across multiple verticals
- ${input.type === 'INTERNSHIP' ? 'Stipend with strong potential to convert to permanent after 2–3 months' : 'Annual increments tied to performance — first review in 6 months'}
- Statutory benefits (EOBI, leave entitlements per Convertt Leave Policy)

## How to Apply

Send your CV${family === 'DESIGNER' ? ' and portfolio link' : family === 'DEVELOPER' ? ' and GitHub / live work samples' : ''}, with a 3-line note on why this role fits you. Shortlisted candidates hear back within 7 working days.

---

*Auto-drafted by Convertt HR. Edit any section before publishing — the polish you add stays put.*`
}

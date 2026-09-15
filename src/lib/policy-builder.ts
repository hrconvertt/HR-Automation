/**
 * The policy builder's knowledge — what a policy in a structured company must
 * say, the templates that start one, and the conversion between the builder's
 * fields and the stored policy text.
 *
 * A policy is stored exactly the way the HR Playbook's policies are: a
 * "Policy detail" table (policy ID, owner, approver, dates, who it applies
 * to…) followed by numbered sections and a revision history. The official
 * document view lifts that table into its Document control panel, so a policy
 * made here reads the same as CVT-POL-301. No schema change was needed — and
 * editing an imported Playbook policy parses it back into the same fields.
 *
 * Starter text never states a company fact HR has not written: numbers,
 * thresholds and names are left as [placeholders], and the completeness check
 * refuses to call a policy finished while any remain.
 *
 * Free of server imports so the client builder uses it directly.
 */

export const POLICY_CATEGORIES = [
  { key: 'CODE_OF_CONDUCT', label: 'Code of Conduct' },
  { key: 'SECURITY', label: 'Confidentiality & Security' },
  { key: 'IT', label: 'IT' },
  { key: 'COMPENSATION', label: 'Compensation' },
  { key: 'LEAVE', label: 'Leave' },
  { key: 'GENERAL', label: 'General' },
] as const

export const POLICY_TYPES = [
  { key: 'HR_POLICY', label: 'HR policy' },
  { key: 'LEAVE_POLICY', label: 'Leave policy' },
  { key: 'CODE_OF_CONDUCT', label: 'Code of conduct' },
  { key: 'ANTI_HARASSMENT', label: 'Anti-harassment' },
  { key: 'IT_SECURITY', label: 'IT & security' },
  { key: 'HEALTH_SAFETY', label: 'Health & safety' },
  { key: 'COMPENSATION_POLICY', label: 'Compensation policy' },
  { key: 'NDA_TEMPLATE', label: 'NDA template' },
  { key: 'OTHER', label: 'Other' },
] as const

/** What the document is — the ID prefix, which the official document reads. */
export const DOCUMENT_KINDS = [
  { prefix: 'CVT-POL', label: 'Policy', hint: 'A rule people must follow.' },
  { prefix: 'CVT-SOP', label: 'Procedure (SOP)', hint: 'The steps to carry something out.' },
  { prefix: 'CVT-ANX', label: 'Country employment terms', hint: 'Terms that apply in one country.' },
] as const
export type DocumentKind = (typeof DOCUMENT_KINDS)[number]['prefix']

export const CLASSIFICATIONS = [
  'Private & Confidential — Internal Use Only',
  'Internal — all staff',
  'Restricted — HR and management only',
  'Public',
] as const

export const ENTITY_OPTIONS = [
  { key: 'BOTH', label: 'Both companies', phrase: 'Convertt (Pakistan) and SyeDev LLC FZ (UAE)' },
  { key: 'PK', label: 'Convertt — Pakistan', phrase: 'Convertt (Pakistan)' },
  { key: 'AE', label: 'SyeDev LLC FZ — UAE', phrase: 'SyeDev LLC FZ (UAE)' },
] as const
export type EntityKey = (typeof ENTITY_OPTIONS)[number]['key']

export const REVIEW_CYCLES = [
  { label: 'Every 6 months', months: 6 },
  { label: 'Annual', months: 12 },
  { label: 'Annual, and on any change in Pakistan or UAE employment law', months: 12 },
  { label: 'Every 2 years', months: 24 },
] as const

export const EMPLOYMENT_GROUPS = ['Employees', 'Probationers', 'Trainees', 'Interns', 'Contractors'] as const
export const DEFAULT_GROUPS = ['Employees', 'Probationers', 'Trainees', 'Interns']

export const OWNER_ROLES = ['HR Manager', 'Founder / CEO', 'Finance Manager', 'Operations Manager', 'Head of Department'] as const

export const PLAYBOOK_CLAUSE =
  'Where this policy and the HR Playbook differ, the Playbook prevails. Where either conflicts with the Country Annex or mandatory local law, the Annex and the law prevail for employees in that country.'

const LEGAL_NOTE = '*Listed for orientation. Confirm the current text of the law with legal counsel before relying on it.*'

/** The Playbook's own wording for how breaches are handled (CVT-HR-PB-001, SOP-09). */
export const COMPLIANCE_STARTER = `Breaches are handled through the disciplinary process in SOP-09 of the Playbook, which is due process in both countries:

- **Pakistan:** written show-cause notice, the employee's written reply, an impartial domestic inquiry with a hearing, then a reasoned written order.
- **UAE:** sanctions per Art. 39 of Federal Decree-Law 33/2021 (warning, deduction, suspension, dismissal). Summary dismissal only on Art. 44 grounds and only after a written investigation in which the employee is heard.

Any employee may raise a concern or grievance in writing to HR, or to the Founder if it concerns HR. HR acknowledges within 2 working days and gives an outcome within 10.`

// ─── Laws a policy may rest on ────────────────────────────────────────────────

export const LEGAL_REFERENCES = [
  { label: 'Punjab Shops and Establishments Ordinance, 1969', country: 'PK', topics: ['leave', 'attendance', 'general', 'remote'] },
  { label: 'Industrial and Commercial Employment (Standing Orders) Ordinance, 1968', country: 'PK', topics: ['disciplinary', 'grievance', 'exit', 'probation', 'attendance', 'general'] },
  { label: 'Payment of Wages Act, 1936', country: 'PK', topics: ['compensation', 'exit'] },
  { label: 'Income Tax Ordinance, 2001', country: 'PK', topics: ['compensation', 'expenses'] },
  { label: "Employees' Old-Age Benefits Act, 1976", country: 'PK', topics: ['compensation'] },
  { label: 'Protection against Harassment of Women at the Workplace Act, 2010', country: 'PK', topics: ['harassment', 'conduct', 'grievance'] },
  { label: 'Prevention of Electronic Crimes Act, 2016', country: 'PK', topics: ['it', 'data'] },
  { label: 'UAE Federal Decree-Law No. 33 of 2021 on the Regulation of Labour Relations', country: 'AE', topics: ['leave', 'attendance', 'general', 'disciplinary', 'grievance', 'exit', 'probation', 'compensation', 'harassment', 'conduct', 'remote'] },
  { label: 'UAE Cabinet Resolution No. 1 of 2022 (Executive Regulations of the Labour Law)', country: 'AE', topics: ['leave', 'general', 'disciplinary', 'exit', 'probation'] },
  { label: 'UAE Federal Decree-Law No. 45 of 2021 on the Protection of Personal Data', country: 'AE', topics: ['data', 'it'] },
] as const

export function legalSuggestions(entity: EntityKey, topics: string[]): string[] {
  return LEGAL_REFERENCES
    .filter((l) => entity === 'BOTH' || l.country === entity)
    .filter((l) => topics.length === 0 || l.topics.some((t) => topics.includes(t)))
    .map((l) => l.label)
}

// ─── Sections ─────────────────────────────────────────────────────────────────

export type SectionKind = 'text' | 'definitions' | 'roles' | 'related' | 'legal'

export interface SectionDef {
  key: string
  title: string
  kind: SectionKind
  required: boolean
  /** On by default in a new policy. */
  defaultOn: boolean
  guidance: string
  cover: string[]
  starter?: string
}

export const SECTION_DEFS: SectionDef[] = [
  {
    key: 'purpose', title: 'Purpose', kind: 'text', required: true, defaultOn: true,
    guidance: 'Why this policy exists — the risk it deals with and the outcome it is for.',
    cover: ['The problem or risk this policy addresses', 'Who or what it protects — people, clients, the company', 'The outcome it is meant to achieve'],
    starter: 'This policy sets out [what the policy governs] so that everyone at Convertt knows [what is expected], and so that [the risk it prevents] is avoided.',
  },
  {
    key: 'scope', title: 'Scope', kind: 'text', required: true, defaultOn: true,
    guidance: 'Who it applies to, where, and what it deliberately does not cover.',
    cover: ['Which people it applies to (employees, probationers, trainees, interns, contractors)', 'Where it applies — office, remote, client sites, work travel', 'Anything explicitly out of scope, and which policy covers that instead'],
    starter: 'Applies to [who] in Pakistan and the UAE, in the office, remotely, and in any work-connected setting. It does not cover [exclusions], which are covered by [other policy].',
  },
  {
    key: 'definitions', title: 'Definitions', kind: 'definitions', required: false, defaultOn: true,
    guidance: 'Terms that could be read two ways. Define them once, and use them exactly.',
    cover: ['Any term a reader might interpret differently', 'Company-specific words (e.g. "working day", "reporting manager")'],
  },
  {
    key: 'statement', title: 'Policy statement', kind: 'text', required: true, defaultOn: true,
    guidance: 'The rules themselves. Split into numbered sub-sections (### 4.1, ### 4.2) — one rule each.',
    cover: ['Each rule, stated as what people must or must not do', 'Limits, amounts and thresholds — exact figures, not "reasonable"', 'What needs approval, and from whom'],
    starter: '### 4.1 [First rule]\n\n[What people must do, and any limit that applies.]\n\n### 4.2 [Second rule]\n\n[What people must not do.]',
  },
  {
    key: 'eligibility', title: 'Eligibility', kind: 'text', required: false, defaultOn: false,
    guidance: 'Who qualifies for what this policy gives, and from when.',
    cover: ['Who is eligible and who is not', 'When eligibility starts (e.g. after probation)', 'How part-year joiners and leavers are treated'],
    starter: '- [Group] become eligible [when].\n- [Group] are not eligible for [what].\n- People who join or leave part-way through the year receive [pro-rated / no] entitlement.',
  },
  {
    key: 'procedure', title: 'Procedure', kind: 'text', required: false, defaultOn: false,
    guidance: 'The steps, in order, with who does each one and by when.',
    cover: ['Each step in order', 'Who is responsible for each step', 'Time limits (e.g. "within 2 working days")', 'Where it is done — which screen in Convertt HR, or which form'],
    starter: '1. [The employee] [does what] in Convertt HR at least [n] working days before [event].\n2. [The reporting manager] approves or rejects within [n] working days.\n3. [HR] records the outcome and [next step].',
  },
  {
    key: 'roles', title: 'Roles and responsibilities', kind: 'roles', required: true, defaultOn: true,
    guidance: 'Who does what. Every duty in the policy should belong to someone here.',
    cover: ['What every employee must do', 'What reporting managers must do', 'What HR does and records', 'Who decides exceptions and disputes'],
  },
  {
    key: 'exceptions', title: 'Exceptions', kind: 'text', required: false, defaultOn: false,
    guidance: 'When the policy may be set aside, who can allow it, and how that is recorded.',
    cover: ['Who can approve an exception', 'How an exception is requested', 'How it is recorded'],
    starter: 'Exceptions are approved in writing by [role] only, on a written request setting out the reason. HR records every exception granted.',
  },
  {
    key: 'compliance', title: 'Compliance and violations', kind: 'text', required: true, defaultOn: true,
    guidance: 'What happens when the policy is broken, and how concerns are raised.',
    cover: ['The disciplinary process that applies', 'How a concern or grievance is raised, and how fast HR responds'],
    starter: COMPLIANCE_STARTER,
  },
  {
    key: 'related', title: 'Related policies, procedures and forms', kind: 'related', required: false, defaultOn: true,
    guidance: 'Other documents a reader may need alongside this one.',
    cover: ['Policies that overlap or are referred to', 'SOPs and forms used to follow this policy'],
  },
  {
    key: 'legal', title: 'Legal references', kind: 'legal', required: false, defaultOn: true,
    guidance: 'The laws this policy rests on in each country it covers.',
    cover: ['Employment law for each country covered', 'Any specific statute the policy puts into effect'],
  },
  {
    key: 'contact', title: 'Questions and contacts', kind: 'text', required: false, defaultOn: false,
    guidance: 'Where people go with questions about this policy.',
    cover: ['Who to contact, and how'],
    starter: 'Questions about this policy go to HR at hr@convertt.co, or through a case in the Help Center.',
  },
]

export function sectionDef(key: string): SectionDef | undefined {
  return SECTION_DEFS.find((d) => d.key === key)
}

// ─── Templates ────────────────────────────────────────────────────────────────

export interface PolicyTemplate {
  key: string
  label: string
  blurb: string
  keywords: RegExp
  category: string
  type: string
  description: string
  /** Optional sections this kind of policy normally needs. */
  optional: string[]
  cover: Partial<Record<string, string[]>>
  starters: Partial<Record<string, string>>
  definitions: [string, string][]
  roles: [string, string][]
  topics: string[]
}

const BASE_ROLES: [string, string][] = [
  ['Every employee', 'Reads and follows this policy, and asks HR when unsure.'],
  ['Reporting Manager', 'Applies this policy in their team and escalates suspected breaches to HR.'],
  ['HR Manager', 'Owns this policy, answers questions, keeps the records it requires and reviews it on schedule.'],
  ['Founder / CEO', 'Approves this policy and decides exceptions and serious breaches.'],
]

export const POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    key: 'blank', label: 'Blank policy', blurb: 'Start with the standard structure and write every section yourself.',
    keywords: /$^/, category: 'GENERAL', type: 'HR_POLICY', description: '', optional: [],
    cover: {}, starters: {}, definitions: [], roles: BASE_ROLES, topics: ['general'],
  },
  {
    key: 'leave', label: 'Leave & Time Off', blurb: 'Leave types, entitlements, how to apply, evidence, carry-over and leave on exit.',
    keywords: /\b(leave|time ?off|vacation|holiday|sick|annual leave|maternity|paternity|bereavement)\b/i,
    category: 'LEAVE', type: 'LEAVE_POLICY',
    description: 'The leave people are entitled to, how to apply for it, and how it is approved and recorded.',
    optional: ['eligibility', 'procedure'],
    cover: {
      statement: ['Each leave type (annual, casual, sick, bereavement, maternity/paternity…) and its days per year', 'How leave accrues, and whether unused leave carries over or lapses', 'Notice required before taking leave', 'Evidence required (e.g. a medical certificate after [n] consecutive days)', 'Half days, and whether weekends between leave days count (sandwich rule)', 'What happens to leave balances on exit'],
      eligibility: ['Entitlement during probation', 'Entitlement for interns and trainees', 'Pro-rating for part-year joiners'],
      procedure: ['Applying in Convertt HR under Leave', 'Manager approval time limit', 'Emergency or same-day leave'],
    },
    starters: {
      statement: '### 4.1 Leave types and entitlement\n\n| Leave type | Days per year | Notice required |\n|---|---|---|\n| Annual | [n] | [n] working days |\n| Casual | [n] | [n] hours |\n| Sick | [n] | As soon as possible |\n\n### 4.2 Carry-over\n\nUnused [annual] leave [carries over up to n days / lapses] at the end of the leave year.\n\n### 4.3 Evidence\n\nSick leave of more than [n] consecutive days requires a medical certificate.',
    },
    definitions: [['Working day', 'A day the employee is scheduled to work under their contract, excluding public holidays.'], ['Half day', 'Leave for [n] hours of a working day.'], ['Leave year', 'The period [1 January to 31 December] over which entitlement is counted.']],
    roles: [['Every employee', 'Applies for leave in Convertt HR in advance and provides evidence when required.'], ['Reporting Manager', 'Approves or rejects leave requests within [n] working days, giving a reason for rejection.'], ['HR Manager', 'Maintains leave balances, checks evidence and resolves disputes.']],
    topics: ['leave'],
  },
  {
    key: 'attendance', label: 'Attendance & Punctuality', blurb: 'Working hours, clocking in, lateness, absence and how it is recorded.',
    keywords: /\b(attendance|punctual|late(ness)?|working hours|clock ?in|absence|timekeeping)\b/i,
    category: 'GENERAL', type: 'HR_POLICY',
    description: 'Working hours and days, how attendance is recorded, and what happens when someone is late or absent.',
    optional: ['procedure'],
    cover: { statement: ['Working days and hours for each location', 'Clocking in and out in Convertt HR, onsite and remote', 'Grace period for late arrival', 'Reporting an absence — to whom and by when', 'Consequences of repeated lateness or unreported absence'] },
    starters: { statement: '### 4.1 Working hours\n\nThe working week is [days], [start time] to [end time] [Pakistan / UAE] time.\n\n### 4.2 Recording attendance\n\nEveryone clocks in and out in Convertt HR each working day.\n\n### 4.3 Lateness and absence\n\nArriving more than [n] minutes late counts as late. An absence must be reported to the reporting manager before [time].' },
    definitions: [['Late arrival', 'Clocking in more than [n] minutes after the scheduled start time.']],
    roles: BASE_ROLES, topics: ['attendance'],
  },
  {
    key: 'remote', label: 'Remote & Work From Home', blurb: 'Who can work remotely, how to request it, availability, equipment and security.',
    keywords: /\b(remote|wfh|work ?from ?home|hybrid|telework)\b/i,
    category: 'GENERAL', type: 'HR_POLICY',
    description: 'When work from home is allowed, how it is requested and approved, and what is expected while working remotely.',
    optional: ['eligibility', 'procedure'],
    cover: { statement: ['Roles that can and cannot work remotely', 'How many remote days are allowed', 'Hours people must be reachable', 'Equipment, internet and data security at home'], eligibility: ['Whether probationers can work remotely'] },
    starters: {},
    definitions: [['Work from home (WFH)', 'A working day performed away from the office with the reporting manager’s approval.']],
    roles: BASE_ROLES, topics: ['remote'],
  },
  {
    key: 'conduct', label: 'Code of Conduct & Ethics', blurb: 'Integrity, professional behaviour, gifts, conflicts of interest and anti-bribery.',
    keywords: /\b(conduct|ethic|integrity|bribery|gift|conflict of interest|moonlight)\b/i,
    category: 'CODE_OF_CONDUCT', type: 'CODE_OF_CONDUCT',
    description: 'How we work: integrity, professional conduct, gifts and hospitality, conflicts of interest and anti-bribery.',
    optional: [],
    cover: { statement: ['Integrity and honesty', 'Professional behaviour with clients and colleagues', 'Gifts and hospitality — declaration thresholds per country', 'Conflicts of interest and secondary employment', 'Anti-bribery'] },
    starters: {},
    definitions: [['Conflict of interest', 'Any personal interest, relationship or engagement that interferes, or appears to interfere, with the interests of Convertt or its clients.']],
    roles: BASE_ROLES, topics: ['conduct'],
  },
  {
    key: 'harassment', label: 'Anti-Harassment & Equal Opportunity', blurb: 'What harassment is, how to report it, the inquiry committee and protection from retaliation.',
    keywords: /\b(harass|discriminat|equal opportunit|bully|diversity|inclusion|retaliat)\b/i,
    category: 'CODE_OF_CONDUCT', type: 'ANTI_HARASSMENT',
    description: 'A workplace free of harassment and discrimination: what is not tolerated, how to report it, and how complaints are handled.',
    optional: ['procedure'],
    cover: { statement: ['What counts as harassment and discrimination', 'Zero tolerance for retaliation', 'Confidentiality of complaints'], procedure: ['How and to whom a complaint is made', 'The inquiry committee and its timeline', 'Interim protection for the complainant', 'Outcome and appeal'] },
    starters: {},
    definitions: [['Harassment', '[Definition as set by the applicable law in each country.]'], ['Retaliation', 'Any adverse action against someone for raising a complaint in good faith or taking part in an inquiry.']],
    roles: [...BASE_ROLES, ['Inquiry Committee', 'Investigates complaints impartially and recommends an outcome within [n] days.']],
    topics: ['harassment'],
  },
  {
    key: 'it', label: 'IT & Acceptable Use', blurb: 'Company devices, accounts, passwords, software, internet use and monitoring.',
    keywords: /\b(it\b|acceptable use|laptop|device|password|software|byod|email use|internet)\b/i,
    category: 'IT', type: 'IT_SECURITY',
    description: 'How company devices, accounts and systems may be used, and how they are kept secure.',
    optional: ['procedure'],
    cover: { statement: ['Use of company laptops and accounts', 'Passwords and two-factor authentication', 'Installing software', 'Personal devices (BYOD)', 'Monitoring and privacy', 'Returning equipment on exit'], procedure: ['Reporting a lost device or security incident — to whom and how fast'] },
    starters: {},
    definitions: [['Company device', 'Any laptop, phone or other equipment issued by Convertt.']],
    roles: [...BASE_ROLES, ['IT', 'Issues and secures devices and accounts, and handles security incidents.']],
    topics: ['it', 'data'],
  },
  {
    key: 'data', label: 'Confidentiality & Data Protection', blurb: 'Confidential information, client data, personal data and intellectual property.',
    keywords: /\b(confidential|data protection|privacy|personal data|intellectual property|\bip\b|nda)\b/i,
    category: 'SECURITY', type: 'HR_POLICY',
    description: 'How confidential information, client data and personal data are handled and protected.',
    optional: ['procedure'],
    cover: { statement: ['What counts as confidential information', 'Handling client data', 'Employee personal data — what is kept, who can see it, how long', 'Ownership of work product and intellectual property', 'Confidentiality after employment ends'], procedure: ['Reporting a data breach'] },
    starters: {},
    definitions: [['Confidential information', 'Any non-public information about Convertt, its clients or its people.'], ['Personal data', 'Any information relating to an identified or identifiable person.']],
    roles: BASE_ROLES, topics: ['data'],
  },
  {
    key: 'expenses', label: 'Travel & Expense Reimbursement', blurb: 'What can be claimed, approval, receipts, limits and how claims are paid.',
    keywords: /\b(expense|reimburse|travel|per diem|claim)\b/i,
    category: 'COMPENSATION', type: 'HR_POLICY',
    description: 'Which business expenses are reimbursed, the limits that apply, and how to claim.',
    optional: ['procedure'],
    cover: { statement: ['Expenses that can and cannot be claimed', 'Limits per category (travel, meals, lodging)', 'Pre-approval needed', 'Receipts required'], procedure: ['Submitting a claim and the deadline', 'Approval steps', 'When reimbursement is paid'] },
    starters: {},
    definitions: [['Business expense', 'A cost incurred wholly for Convertt’s work and approved in advance where required.']],
    roles: [...BASE_ROLES, ['Finance', 'Checks claims against this policy and pays approved reimbursements.']],
    topics: ['expenses', 'compensation'],
  },
  {
    key: 'compensation', label: 'Compensation & Benefits', blurb: 'Pay structure, allowances, reviews, bonuses and deductions.',
    keywords: /\b(compensation|salary|pay\b|allowance|bonus|increment|benefit|payroll)\b/i,
    category: 'COMPENSATION', type: 'COMPENSATION_POLICY',
    description: 'How pay is structured, reviewed and paid, and the allowances and benefits that apply.',
    optional: ['eligibility', 'procedure'],
    cover: { statement: ['Salary structure and components', 'Allowances and who receives them', 'Pay date and method', 'Salary review cycle', 'Bonuses — discretionary or contractual', 'Deductions and tax'] },
    starters: {},
    definitions: [['Gross salary', 'Basic salary plus all fixed allowances, before deductions.']],
    roles: [...BASE_ROLES, ['Finance', 'Processes payroll accurately and on time.']],
    topics: ['compensation'],
  },
  {
    key: 'recruitment', label: 'Recruitment & Selection', blurb: 'Raising a requisition, advertising, screening, interviews, offers and checks.',
    keywords: /\b(recruit|hiring|hire\b|selection|interview|requisition|offer letter)\b/i,
    category: 'GENERAL', type: 'HR_POLICY',
    description: 'How roles are approved, advertised and filled fairly, from requisition to accepted offer.',
    optional: ['procedure'],
    cover: { statement: ['Approval needed before a role is advertised', 'Fair and consistent selection', 'Referrals and hiring relatives', 'Background verification before joining'], procedure: ['Requisition', 'Job description', 'Screening and interviews', 'Offer approval', 'Background verification'] },
    starters: {},
    definitions: [],
    roles: BASE_ROLES, topics: ['general'],
  },
  {
    key: 'probation', label: 'Probation & Confirmation', blurb: 'Probation length, check-ins, extension, confirmation and ending employment in probation.',
    keywords: /\b(probation|confirmation|new hire|onboarding)\b/i,
    category: 'GENERAL', type: 'HR_POLICY',
    description: 'How the probation period works, how performance is reviewed during it, and how it ends.',
    optional: ['procedure'],
    cover: { statement: ['Length of probation for each type of hire', 'Check-ins during probation', 'Extending probation', 'Notice during probation'], procedure: ['Settling check-in', 'Manager recommendation', 'HR decision and confirmation letter'] },
    starters: {},
    definitions: [['Confirmation', 'The end of probation with the employee continuing in permanent employment.']],
    roles: BASE_ROLES, topics: ['probation'],
  },
  {
    key: 'performance', label: 'Performance Management', blurb: 'Goals, check-ins, reviews, ratings, appraisals and improvement plans.',
    keywords: /\b(performance|appraisal|review cycle|rating|goal|pip|improvement plan)\b/i,
    category: 'GENERAL', type: 'HR_POLICY',
    description: 'How goals are set, how performance is reviewed and rated, and what happens when it falls short.',
    optional: ['procedure'],
    cover: { statement: ['Goal setting', 'Review cycle and timing', 'Rating scale', 'Link to increments', 'Performance improvement plans'], procedure: ['Self-review', 'Manager review', 'Calibration', 'Release to the employee'] },
    starters: {},
    definitions: [],
    roles: BASE_ROLES, topics: ['general'],
  },
  {
    key: 'disciplinary', label: 'Disciplinary Procedure', blurb: 'Misconduct, show-cause notices, inquiry, hearing, sanctions and appeal.',
    keywords: /\b(disciplin|misconduct|show ?cause|warning|sanction|termination)\b/i,
    category: 'GENERAL', type: 'HR_POLICY',
    description: 'How suspected misconduct is investigated and decided fairly, and the sanctions that may follow.',
    optional: ['procedure'],
    cover: { statement: ['Examples of minor and gross misconduct', 'Sanctions available', 'Right to be heard'], procedure: ['Show-cause notice', 'Written reply and time limit', 'Inquiry and hearing', 'Written decision', 'Appeal'] },
    starters: {},
    definitions: [['Gross misconduct', 'Conduct serious enough to justify dismissal after due process.']],
    roles: BASE_ROLES, topics: ['disciplinary'],
  },
  {
    key: 'grievance', label: 'Grievance Handling', blurb: 'Raising a grievance, timelines, investigation, outcome and appeal.',
    keywords: /\b(grievance|complaint|concern|whistleblow)\b/i,
    category: 'GENERAL', type: 'HR_POLICY',
    description: 'How employees raise a concern or grievance and how it is handled.',
    optional: ['procedure'],
    cover: { statement: ['What can be raised', 'Confidentiality', 'Protection from retaliation'], procedure: ['Raising it in writing or as a Help Center case', 'Acknowledgement time', 'Investigation', 'Outcome and appeal'] },
    starters: {},
    definitions: [],
    roles: BASE_ROLES, topics: ['grievance'],
  },
  {
    key: 'health', label: 'Health & Safety', blurb: 'Safe workplace, incidents, emergencies and first aid.',
    keywords: /\b(health|safety|emergency|fire|first aid|incident|wellbeing)\b/i,
    category: 'GENERAL', type: 'HEALTH_SAFETY',
    description: 'Keeping the workplace safe, and what to do in an emergency or after an incident.',
    optional: ['procedure'],
    cover: { statement: ['Safe workplace responsibilities', 'Emergency procedures and assembly point', 'First aid'], procedure: ['Reporting an incident or near miss'] },
    starters: {},
    definitions: [],
    roles: BASE_ROLES, topics: ['general'],
  },
  {
    key: 'exit', label: 'Resignation, Exit & Offboarding', blurb: 'Notice, handover, clearance, final settlement and experience letters.',
    keywords: /\b(resign|exit|offboard|notice period|clearance|final settlement|relieving)\b/i,
    category: 'GENERAL', type: 'HR_POLICY',
    description: 'How employment ends: notice, handover, clearance, final settlement and documents issued.',
    optional: ['procedure'],
    cover: { statement: ['Notice period by employment type', 'Garden leave or payment in lieu', 'Handover', 'Return of company property', 'Final settlement timing', 'Experience and relieving letters'], procedure: ['Resignation in writing', 'Manager acknowledgement', 'Exit clearance', 'Exit interview', 'Final settlement'] },
    starters: {},
    definitions: [['Last working day', 'The final day the employee works, after serving notice or as agreed in writing.']],
    roles: BASE_ROLES, topics: ['exit'],
  },
]

export function templateFor(title: string): PolicyTemplate | null {
  if (title.trim().length < 3) return null
  return POLICY_TEMPLATES.find((t) => t.key !== 'blank' && t.keywords.test(title)) ?? null
}

// ─── Builder state ───────────────────────────────────────────────────────────

export interface BuilderSection { key: string; title: string; enabled: boolean; body: string; custom?: boolean }
export interface HistoryRow { version: string; effective: string; change: string; approvedBy: string }

export interface BuilderState {
  title: string
  description: string
  kind: DocumentKind
  code: string
  category: string
  type: string
  version: string
  effectiveDate: string // YYYY-MM-DD
  ownerRole: string
  ownerName: string
  approver: string
  entity: EntityKey
  groups: string[]
  departments: string[]
  appliesTo: string
  appliesEdited: boolean
  classification: string
  reviewCycle: string
  supersedes: string
  source: string
  url: string
  audienceRoles: string[]
  sections: BuilderSection[]
  definitions: { term: string; meaning: string }[]
  roles: { role: string; duty: string }[]
  related: string[]
  legal: string[]
  history: HistoryRow[]
  changeNote: string
  playbookClause: boolean
  templateKey: string | null
  /** Detail rows this builder does not edit, kept as they were. */
  extraRows: [string, string][]
}

export function joinList(items: string[]): string {
  const xs = items.filter(Boolean)
  if (xs.length <= 1) return xs.join('')
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}

export function composeAppliesTo(entity: EntityKey, groups: string[], departments: string[]): string {
  const phrase = ENTITY_OPTIONS.find((e) => e.key === entity)?.phrase ?? ENTITY_OPTIONS[0].phrase
  const allDefault = DEFAULT_GROUPS.every((g) => groups.includes(g))
  const people = allDefault
    ? `All employees, probationers, trainees and interns${groups.includes('Contractors') ? ', and contractors through their services agreement' : ''}`
    : groups.length === 0
      ? 'All employees'
      : joinList(groups.map((g, i) => (i === 0 ? g : g.toLowerCase())))
  const where = departments.length ? ` in the ${joinList(departments)} ${departments.length === 1 ? 'department' : 'departments'}` : ''
  return `${people}${where} of ${phrase}`
}

export function longDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export function nextReview(iso: string, cycleLabel: string): string {
  const cycle = REVIEW_CYCLES.find((c) => c.label === cycleLabel)
  if (!cycle || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return ''
  const [y, m, d] = iso.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1 + cycle.months, d))
  return next.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function extractCode(content: string | null | undefined): string | null {
  const m = /\|\s*Policy ID\s*\|\s*([^|\n]+?)\s*\|/i.exec(content ?? '')
  return m ? m[1] : null
}

export function suggestCode(kind: DocumentKind, codes: string[]): string {
  const nums = codes
    .filter((c) => c.startsWith(`${kind}-`))
    .map((c) => parseInt(c.slice(kind.length + 1), 10))
    .filter((n) => !Number.isNaN(n))
  return `${kind}-${nums.length ? Math.max(...nums) + 1 : 101}`
}

export function blankState(today: string): BuilderState {
  const entity: EntityKey = 'BOTH'
  return {
    title: '', description: '', kind: 'CVT-POL', code: '', category: 'GENERAL', type: 'HR_POLICY', version: '1.0',
    effectiveDate: today, ownerRole: 'HR Manager', ownerName: '', approver: '', entity,
    groups: [...DEFAULT_GROUPS], departments: [], appliesTo: composeAppliesTo(entity, DEFAULT_GROUPS, []), appliesEdited: false,
    classification: CLASSIFICATIONS[0], reviewCycle: REVIEW_CYCLES[2].label, supersedes: '', source: '', url: '',
    audienceRoles: ['EMPLOYEE', 'LEAD', 'MANAGER', 'EXECUTIVE', 'FINANCE'],
    sections: SECTION_DEFS.map((d) => ({
      key: d.key, title: d.title, enabled: d.required || d.defaultOn,
      body: d.key === 'compliance' ? COMPLIANCE_STARTER : '',
    })),
    definitions: [], roles: BASE_ROLES.map(([role, duty]) => ({ role, duty })), related: [], legal: [],
    history: [], changeNote: 'First issue.', playbookClause: true, templateKey: null, extraRows: [],
  }
}

/** Applies a template without overwriting anything already written. */
export function applyTemplate(state: BuilderState, t: PolicyTemplate): BuilderState {
  const sections = state.sections.map((s) => {
    const def = sectionDef(s.key)
    if (!def) return s
    const turnOn = def.required || def.defaultOn || t.optional.includes(s.key)
    const starter = t.starters[s.key] ?? def.starter ?? ''
    return {
      ...s,
      enabled: s.enabled || turnOn,
      body: s.body.trim() || def.kind !== 'text' ? s.body : (t.key === 'blank' && s.key !== 'compliance' ? s.body : starter),
    }
  })
  const hasDefs = state.definitions.some((d) => d.term.trim())
  const hasRoles = state.roles.some((r) => r.role.trim() && !BASE_ROLES.some(([br, bd]) => br === r.role && bd === r.duty))
  return {
    ...state,
    templateKey: t.key,
    category: t.key === 'blank' ? state.category : t.category,
    type: t.key === 'blank' ? state.type : t.type,
    description: state.description.trim() || t.description,
    sections,
    definitions: hasDefs ? state.definitions : t.definitions.map(([term, meaning]) => ({ term, meaning })),
    roles: hasRoles ? state.roles : t.roles.map(([role, duty]) => ({ role, duty })),
    legal: state.legal.length ? state.legal : legalSuggestions(state.entity, t.topics),
  }
}

export function coverFor(key: string, templateKey: string | null): string[] {
  const t = POLICY_TEMPLATES.find((x) => x.key === templateKey)
  return t?.cover[key] ?? sectionDef(key)?.cover ?? []
}

// ─── Compose: fields → stored policy text ────────────────────────────────────

const cell = (s: string) => s.replace(/\|/g, '/').replace(/\s*\n\s*/g, ' ').trim()

export function ownerText(s: BuilderState): string {
  return [s.ownerRole.trim(), s.ownerName.trim()].filter(Boolean).join(' — ')
}

function sectionBody(state: BuilderState, s: BuilderSection): string {
  const kind = s.custom ? 'text' : sectionDef(s.key)?.kind ?? 'text'
  switch (kind) {
    case 'definitions':
      return state.definitions.filter((d) => d.term.trim()).map((d) => `- **${d.term.trim()}:** ${d.meaning.trim()}`).join('\n')
    case 'roles': {
      const rows = state.roles.filter((r) => r.role.trim())
      return rows.length ? ['| Role | Responsibility |', '|---|---|', ...rows.map((r) => `| ${cell(r.role)} | ${cell(r.duty)} |`)].join('\n') : ''
    }
    case 'related':
      return state.related.filter((x) => x.trim()).map((x) => `- ${x.trim()}`).join('\n')
    case 'legal': {
      const items = state.legal.filter((x) => x.trim())
      return items.length ? `${items.map((x) => `- ${x.trim()}`).join('\n')}\n\n${LEGAL_NOTE}` : ''
    }
    default:
      return s.body.trim()
  }
}

export function composeContent(state: BuilderState): string {
  const effective = longDate(state.effectiveDate)
  const rows: [string, string][] = [
    ['Policy ID', state.code],
    ['Policy owner', ownerText(state)],
    ['Approved by', state.approver],
    ['Version', state.version],
    ['Effective date', effective],
    ['Applies to', state.appliesTo],
    ['Legal entity', ENTITY_OPTIONS.find((e) => e.key === state.entity)?.phrase ?? ''],
    ['Classification', state.classification],
    ['Review cycle', state.reviewCycle],
    ['Next review', nextReview(state.effectiveDate, state.reviewCycle)],
    ['Supersedes', state.supersedes],
    ['Source', state.source],
    ...state.extraRows,
  ]
  const out: string[] = ['| Policy detail | |', '|---|---|']
  for (const [k, v] of rows) if (v && v.trim()) out.push(`| ${k} | ${cell(v)} |`)
  out.push('')

  let n = 0
  for (const s of state.sections) {
    if (!s.enabled) continue
    const body = sectionBody(state, s)
    if (!body) continue
    n++
    out.push(`## ${n}. ${s.title.trim() || 'Untitled section'}`, '', body, '')
  }

  const history = [...state.history]
  const current = history.find((h) => h.version === state.version)
  if (current) {
    if (state.changeNote.trim()) current.change = state.changeNote.trim()
    current.effective = effective || current.effective
    current.approvedBy = state.approver || current.approvedBy
  } else {
    history.push({ version: state.version, effective, change: state.changeNote.trim() || 'First issue.', approvedBy: state.approver })
  }
  out.push('## Revision history', '', '| Version | Effective | Change | Approved by |', '|---|---|---|---|')
  for (const h of history) out.push(`| ${cell(h.version)} | ${cell(h.effective)} | ${cell(h.change)} | ${cell(h.approvedBy)} |`)
  out.push('')

  if (state.playbookClause) out.push('---', '', PLAYBOOK_CLAUSE)
  return out.join('\n').trimEnd() + '\n'
}

// ─── Parse: stored policy text → fields ──────────────────────────────────────

const norm = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()

function matchSectionKey(title: string): string | null {
  const t = norm(title)
  if (t === 'purpose' || t.startsWith('purpose')) return 'purpose'
  if (t === 'scope' || t.startsWith('scope')) return 'scope'
  if (t.startsWith('definition')) return 'definitions'
  if (t.startsWith('policy statement') || t === 'policy') return 'statement'
  if (t.startsWith('eligibility')) return 'eligibility'
  if (t.startsWith('procedure')) return 'procedure'
  if (t.startsWith('roles') || t.startsWith('responsibilities')) return 'roles'
  if (t.startsWith('exception')) return 'exceptions'
  if (t.startsWith('compliance') || t.startsWith('violations') || t.startsWith('non compliance')) return 'compliance'
  if (t.startsWith('related')) return 'related'
  if (t.startsWith('legal')) return 'legal'
  if (t.startsWith('question') || t.startsWith('contact')) return 'contact'
  return null
}

function tableRows(lines: string[]): string[][] | null {
  const content = lines.filter((l) => l.trim())
  if (content.length < 2 || !content.every((l) => /^\|.*\|\s*$/.test(l.trim()))) return null
  return content.slice(2).map((l) => l.trim().split('|').slice(1, -1).map((c) => c.trim()))
}

function bullets(lines: string[]): string[] | null {
  const content = lines.filter((l) => l.trim() && l.trim() !== LEGAL_NOTE)
  if (!content.every((l) => /^\s*[-*]\s+/.test(l))) return null
  return content.map((l) => l.replace(/^\s*[-*]\s+/, '').trim())
}

export interface PolicyMeta {
  title: string
  description: string | null
  category: string
  type: string
  version: string
  effectiveDate: string | null // ISO
  url: string | null
  audienceRoles: string[]
}

export function parsePolicy(content: string | null, meta: PolicyMeta): BuilderState {
  const base = blankState(meta.effectiveDate ? meta.effectiveDate.slice(0, 10) : todayIso())
  const state: BuilderState = {
    ...base,
    title: meta.title,
    description: meta.description ?? '',
    category: meta.category,
    type: meta.type,
    version: meta.version || '1.0',
    url: meta.url ?? '',
    audienceRoles: meta.audienceRoles.length ? meta.audienceRoles : base.audienceRoles,
    effectiveDate: meta.effectiveDate ? meta.effectiveDate.slice(0, 10) : '',
    sections: SECTION_DEFS.map((d) => ({ key: d.key, title: d.title, enabled: false, body: '' })),
    definitions: [], roles: [], related: [], legal: [], history: [],
    changeNote: '', playbookClause: false, appliesEdited: true,
  }

  let lines = (content ?? '').replace(/\r\n/g, '\n').split('\n')

  // Trailing Playbook clause.
  const clauseAt = lines.findIndex((l) => l.trim().startsWith('Where this policy and the HR Playbook differ'))
  if (clauseAt >= 0) {
    state.playbookClause = true
    lines = lines.slice(0, clauseAt)
    while (lines.length && (!lines[lines.length - 1].trim() || /^---+\s*$/.test(lines[lines.length - 1]))) lines.pop()
  }

  // The Policy detail table.
  let i = 0
  while (i < lines.length && !lines[i].trim()) i++
  if (/^\|\s*(Policy|Document) detail\s*\|/i.test(lines[i] ?? '')) {
    i += 2
    while (i < lines.length && /^\|.+\|\s*$/.test(lines[i])) {
      const [k, v = ''] = lines[i].split('|').slice(1, -1).map((c) => c.trim())
      const key = norm(k)
      if (key === 'policy id' || key === 'document id') {
        state.code = v
        state.kind = (DOCUMENT_KINDS.find((d) => v.startsWith(d.prefix))?.prefix ?? 'CVT-POL') as DocumentKind
      } else if (key === 'policy owner' || key === 'owner') {
        const [role, ...name] = v.split(' — ')
        state.ownerRole = role ?? ''
        state.ownerName = name.join(' — ')
      } else if (key === 'approved by' || key === 'approver') state.approver = v
      else if (key === 'version') state.version = state.version || v
      else if (key === 'effective date') { /* the column is the source of truth */ }
      else if (key === 'applies to') state.appliesTo = v
      else if (key === 'legal entity') state.entity = (ENTITY_OPTIONS.find((e) => e.phrase === v)?.key ?? 'BOTH') as EntityKey
      else if (key === 'classification') state.classification = v
      else if (key === 'review cycle') state.reviewCycle = v
      else if (key === 'next review') { /* recomputed */ }
      else if (key === 'supersedes') state.supersedes = v
      else if (key === 'source') state.source = v
      else if (k) state.extraRows.push([k, v])
      i++
    }
  }
  if (!state.appliesTo) {
    state.appliesTo = base.appliesTo
    state.appliesEdited = false
  } else if (!lines.some((l) => /^\|\s*Legal entity\s*\|/i.test(l))) {
    const a = state.appliesTo
    state.entity = /SyeDev|UAE/i.test(a) && /Pakistan|Convertt \(/i.test(a) ? 'BOTH' : /SyeDev|UAE/i.test(a) ? 'AE' : /Pakistan/i.test(a) ? 'PK' : 'BOTH'
  }

  // The sections.
  const rest = lines.slice(i)
  const chunks: { title: string; lines: string[] }[] = []
  let current: { title: string; lines: string[] } = { title: '', lines: [] }
  for (const l of rest) {
    const h = /^##\s+(.*)$/.exec(l)
    if (h && !l.startsWith('###')) {
      chunks.push(current)
      current = { title: h[1].trim(), lines: [] }
    } else current.lines.push(l)
  }
  chunks.push(current)

  const customs: BuilderSection[] = []
  for (const c of chunks) {
    const body = c.lines.join('\n').trim()
    if (!c.title) {
      if (body) customs.push({ key: `custom-intro`, title: 'Policy text', enabled: true, body, custom: true })
      continue
    }
    const title = c.title.replace(/^\d+(\.\d+)*\.?\s+/, '')
    if (norm(title) === 'revision history') {
      const rows = tableRows(c.lines)
      if (rows) state.history = rows.filter((r) => r[0]).map((r) => ({ version: r[0] ?? '', effective: r[1] ?? '', change: r[2] ?? '', approvedBy: r[3] ?? '' }))
      continue
    }
    const key = matchSectionKey(title)
    const def = key ? sectionDef(key) : undefined
    const slot = key ? state.sections.find((s) => s.key === key) : undefined
    let handled = false
    if (def && slot && !slot.enabled) {
      if (def.kind === 'text') {
        slot.body = body
        handled = true
      } else if (def.kind === 'definitions') {
        const items = c.lines.filter((l) => l.trim())
        const parsed = items.map((l) => /^\s*[-*]\s+\*\*([^*]+?):?\*\*:?\s*(.*)$/.exec(l))
        if (items.length && parsed.every(Boolean)) {
          state.definitions = parsed.map((m) => ({ term: m![1].trim(), meaning: m![2].trim() }))
          handled = true
        }
      } else if (def.kind === 'roles') {
        const rows = tableRows(c.lines)
        if (rows) { state.roles = rows.map((r) => ({ role: r[0] ?? '', duty: r[1] ?? '' })); handled = true }
      } else if (def.kind === 'related') {
        const b = bullets(c.lines)
        if (b) { state.related = b; handled = true }
      } else if (def.kind === 'legal') {
        const b = bullets(c.lines)
        if (b) { state.legal = b; handled = true }
      }
      if (handled) {
        slot.enabled = true
        slot.title = title
      }
    }
    if (!handled && body) customs.push({ key: `custom-${customs.length}-${norm(title).slice(0, 20)}`, title, enabled: true, body, custom: true })
  }

  // Custom sections keep their place after the standard ones they followed;
  // in practice they sit before Related policies.
  const relatedAt = state.sections.findIndex((s) => s.key === 'related')
  state.sections.splice(relatedAt, 0, ...customs)
  return state
}

// ─── Completeness ─────────────────────────────────────────────────────────────

export interface CheckItem { label: string; ok: boolean; step: number; hint: string; blocking?: boolean }

const PLACEHOLDER = /\[(?!\s*\])[^\]\n]{1,80}\]/g

export function placeholderCount(state: BuilderState): number {
  const texts = [
    ...state.sections.filter((s) => s.enabled).map((s) => s.body),
    ...state.definitions.map((d) => `${d.term} ${d.meaning}`),
    ...state.roles.map((r) => `${r.role} ${r.duty}`),
  ]
  return texts.reduce((n, t) => n + (t.match(PLACEHOLDER)?.length ?? 0), 0)
}

export function checklist(state: BuilderState, others: { title: string; code: string | null }[]): CheckItem[] {
  const text = (key: string) => {
    const s = state.sections.find((x) => x.key === key)
    return s?.enabled ? s.body.trim() : ''
  }
  const codeTaken = !!state.code && others.some((o) => o.code === state.code)
  const titleTaken = others.some((o) => norm(o.title) === norm(state.title))
  const placeholders = placeholderCount(state)
  return [
    { label: 'Title', ok: state.title.trim().length >= 4 && !titleTaken, step: 0, blocking: true, hint: titleTaken ? 'Another policy already has this title.' : 'Name the policy.' },
    { label: 'Policy ID, unique', ok: !!state.code && !codeTaken, step: 0, hint: codeTaken ? `${state.code} is already used.` : 'Give it an ID so it can be referred to.' },
    { label: 'Short description for search', ok: state.description.trim().length >= 20, step: 0, hint: 'One sentence saying what the policy covers.' },
    { label: 'Policy owner', ok: !!ownerText(state), step: 1, hint: 'Who keeps it up to date.' },
    { label: 'Approver', ok: !!state.approver.trim(), step: 1, hint: 'Who signs it off.' },
    { label: 'Effective date', ok: !!state.effectiveDate, step: 1, hint: 'When it takes effect.' },
    { label: 'Review cycle', ok: !!state.reviewCycle, step: 1, hint: 'When it must be looked at again.' },
    { label: 'Who it applies to', ok: !!state.appliesTo.trim(), step: 2, hint: 'Which people and which company.' },
    { label: 'Who can read it in the app', ok: state.audienceRoles.length > 0, step: 2, blocking: true, hint: 'Pick at least one role.' },
    { label: 'Purpose written', ok: text('purpose').length >= 40, step: 3, hint: 'Why the policy exists.' },
    { label: 'Scope written', ok: text('scope').length >= 40, step: 3, hint: 'Who and where it covers.' },
    { label: 'Policy statement written', ok: text('statement').length >= 80, step: 3, hint: 'The rules themselves.' },
    { label: 'Roles and responsibilities', ok: state.roles.filter((r) => r.role.trim() && r.duty.trim()).length >= 2, step: 3, hint: 'At least two roles with duties.' },
    { label: 'Compliance and violations', ok: text('compliance').length >= 40, step: 3, hint: 'What happens when it is broken.' },
    { label: 'No [placeholders] left', ok: placeholders === 0, step: 3, hint: placeholders ? `${placeholders} still in [brackets] — replace them with the real detail.` : '' },
    { label: 'Legal references', ok: !sectionOn(state, 'legal') || state.legal.length > 0, step: 4, hint: 'Tick the laws it rests on, or switch the section off.' },
  ]
}

function sectionOn(state: BuilderState, key: string): boolean {
  return !!state.sections.find((s) => s.key === key)?.enabled
}

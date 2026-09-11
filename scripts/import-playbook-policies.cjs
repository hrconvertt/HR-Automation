/**
 * Load the Playbook's policies (CVT-HR-PB-001 Parts 3 and 4) into the
 * Policies module as individual, Workday-style policy documents.
 *
 *   node scripts/import-playbook-policies.cjs            # dry run — prints the plan
 *   node scripts/import-playbook-policies.cjs --apply    # writes
 *
 * Every policy goes in ACTIVE, with the CEO's approval recorded as a
 * PolicyReview row, because Syed Asghar (CEO) signed these off outside the
 * app. It deliberately does NOT go through /api/policies/[id]/activate: that
 * route raises an announcement and one email per employee per policy, and
 * thirteen of each at once is noise. HR can post one announcement instead.
 *
 * The older standalone policies these replace (dated 1 June 2026) are
 * ARCHIVED, not deleted — archive hides them from employees and keeps the
 * history. None of them carry acknowledgments.
 *
 * Idempotent: matched on title, so re-running updates the bodies in place.
 */
// .env holds a stale sqlite URL; Prisma must read .env.local.
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env.local'), override: true })

const { PrismaClient } = require('@prisma/client')

const VERSION = '1.0'
const EFFECTIVE = new Date(Date.UTC(2026, 8, 1)) // 1 September 2026
const EFFECTIVE_LABEL = '1 September 2026'
const APPROVER_LABEL = 'Syed Asghar, Chief Executive Officer'
const APPLIES_TO_ALL =
  'All employees, probationers, trainees and interns of Convertt (Pakistan) and SyeDev LLC FZ (UAE)'
const REVIEW_CYCLE = 'Annual, and on any change in Pakistan or UAE employment law'

/** The June 2026 standalone policies the new set replaces, and by what. */
const SUPERSEDED = {
  'Code of Ethics': 'Code of Conduct & Ethics Policy',
  'Anti-Bribery & Gifts Policy': 'Code of Conduct & Ethics Policy',
  'Conflict of Interest Policy': 'Code of Conduct & Ethics Policy',
  'Moonlighting Policy': 'Code of Conduct & Ethics Policy',
  'IT Acceptable Use Policy': 'IT & Acceptable Use Policy',
  'Compensation & Benefits Policy': 'Compensation Principles Policy',
  'Bonus & Increment Policy': 'Salary Review & Increment Policy',
  'Career Ladder Policy': 'Career Level Framework Policy',
}

// ─── Workday-style document scaffold ──────────────────────────────────────────

function header(p) {
  return [
    '| Policy detail | |',
    '|---|---|',
    `| Policy ID | ${p.code} |`,
    `| Policy owner | HR Manager |`,
    `| Approved by | ${APPROVER_LABEL} |`,
    `| Version | ${VERSION} |`,
    `| Effective date | ${EFFECTIVE_LABEL} |`,
    `| Applies to | ${p.appliesTo ?? APPLIES_TO_ALL} |`,
    `| Source | HR Playbook CVT-HR-PB-001, ${p.section} |`,
    `| Review cycle | ${REVIEW_CYCLE} |`,
    '',
  ].join('\n')
}

function footer(p) {
  const replaces = Object.entries(SUPERSEDED)
    .filter(([, by]) => by === p.title)
    .map(([old]) => old)
  const change = replaces.length
    ? `Issued from HR Playbook v1.0. Replaces: ${replaces.join('; ')} (June 2026).`
    : 'Issued from HR Playbook v1.0.'
  return [
    '',
    '## Revision history',
    '',
    '| Version | Effective | Change | Approved by |',
    '|---|---|---|---|',
    `| ${VERSION} | ${EFFECTIVE_LABEL} | ${change} | ${APPROVER_LABEL} |`,
    '',
    '---',
    '',
    'Where this policy and the HR Playbook differ, the Playbook prevails. Where either conflicts with the Country Annex or mandatory local law, the Annex and the law prevail for employees in that country.',
  ].join('\n')
}

const COMPLIANCE = `Breaches are handled through the disciplinary process in SOP-09 of the Playbook, which is due process in both countries:

- **Pakistan:** written show-cause notice, the employee's written reply, an impartial domestic inquiry with a hearing, then a reasoned written order.
- **UAE:** sanctions per Art. 39 of Federal Decree-Law 33/2021 (warning, deduction, suspension, dismissal). Summary dismissal only on Art. 44 grounds and only after a written investigation in which the employee is heard.

Any employee may raise a concern or grievance in writing to HR, or to the Founder if it concerns HR. HR acknowledges within 2 working days and gives an outcome within 10.`

// ─── The policies ─────────────────────────────────────────────────────────────

const POLICIES = [
  {
    title: 'Code of Conduct & Ethics Policy',
    code: 'CVT-POL-301',
    section: '§3.1',
    category: 'CODE_OF_CONDUCT',
    type: 'CODE_OF_CONDUCT',
    requiresAck: true,
    description:
      'How we work: integrity, professional conduct, gifts and hospitality, conflicts of interest and secondary employment, and anti-bribery.',
    body: `## 1. Purpose

This policy sets the standard of integrity and professional behaviour expected of everyone at Convertt, so that clients, colleagues and the company can rely on how we act, and so that everyone knows where the lines are before they are near them.

## 2. Scope

Applies to every employee, probationer, trainee and intern in Pakistan and the UAE, in the office, remotely, and in any work-connected setting. Contractors are bound through their services agreement and contractor NDA.

## 3. Definitions

- **Gift or hospitality:** anything of value received from a client, supplier or candidate: goods, meals, events, travel, services or discounts.
- **Cash-equivalent:** vouchers, gift cards, prepaid cards, or anything readily convertible to money.
- **Conflict of interest:** any personal interest, relationship or engagement that interferes, or appears to interfere, with the interests of Convertt or its clients.
- **Secondary employment:** any paid or unpaid work outside Convertt, including freelancing.

## 4. Policy statement

### 4.1 Integrity

No dishonesty, falsification, or misuse of company or client resources. When unsure, apply the three-question test:

1. Is it legal?
2. Would I be comfortable if the client saw it?
3. Would I be comfortable if it were public?

### 4.2 Professional conduct

Communicate professionally in every channel. Be punctual for client and internal commitments. "Say it early, not at the deadline" is our operating norm for risk.

### 4.3 Gifts and hospitality

| Country | Declare to HR anything above |
|---|---|
| Pakistan | PKR 5,000 |
| UAE | AED 100 |

- Never solicit gifts.
- Cash and cash-equivalents are always refused, whatever the amount.
- This single threshold replaces all earlier conflicting figures.

### 4.4 Conflicts of interest and secondary employment

- Conflicts of interest and secondary employment are disclosed to HR in writing **before** they begin.
- Client poaching, moonlighting for clients, and competing engagements are prohibited.

### 4.5 Anti-bribery

Offering or accepting anything of value to improperly influence a decision is prohibited in both countries and is grounds for summary action.

## 5. Roles and responsibilities

| Role | Responsibility |
|---|---|
| Every employee | Reads this policy, signs the acknowledgment (Form F-08), declares gifts and discloses conflicts in writing. |
| Reporting Manager | Models the standard, and escalates suspected breaches to HR. |
| HR Manager | Records declarations and disclosures, keeps the F-08 acknowledgment log, and logs incidents in the incident and grievance log. |
| Founder | Decides exceptions and outcomes of serious breaches. |

## 6. Compliance and violations

${COMPLIANCE}

## 7. Related policies, procedures and forms

- Confidentiality, IP & Data Protection Policy
- Anti-Harassment & Equal Opportunity Policy
- Social Media & Public Communication Policy
- SOP-06 NDA, confidentiality & IP; SOP-09 Performance, discipline & grievance
- Form F-08 Policy & Code of Conduct Acknowledgment
`,
  },

  {
    title: 'Confidentiality, IP & Data Protection Policy',
    code: 'CVT-POL-302',
    section: '§3.2 and SOP-06',
    category: 'SECURITY',
    type: 'HR_POLICY',
    requiresAck: false,
    appliesTo: `${APPLIES_TO_ALL}, and every contractor or freelancer who touches Convertt or client information`,
    description:
      'Protecting client and company information and intellectual property, and how employee personal data is collected, used, kept and deleted.',
    body: `## 1. Purpose

Our clients trust us with their data, their accounts and their unreleased work. This policy sets how that information, our own intellectual property, and our people's personal data are protected every day.

## 2. Scope

Everyone who touches Convertt or client information, before they are given access: employees, probationers, trainees, interns, contractors and freelancers.

## 3. Policy statement

### 3.1 The NDA is the binding instrument

- Employees of Convertt (Pakistan) sign **Form F-04** under Lahore governing law. Employees of SyeDev LLC FZ (UAE) sign **Form F-05** under UAE governing law. The two are never mixed.
- Contractors sign the contractor variant together with a services agreement.
- The NDA is signed on or before Day 1. **No system access, asset, or client work is given before it is signed.**
- The NDA covers: confidentiality without time limit for trade secrets; work-for-hire and written IP assignment with moral-rights consent; 12-month non-solicitation of clients and staff; non-disparagement; device and data rules; return-and-destruction duties; and remedies.
- Pakistan copies are witnessed by two adults with CNIC numbers. The employee receives a countersigned copy; the original is filed in the personnel file with a scan in the HR drive.

### 3.2 Everyday practice

- Client data lives only in company systems.
- Credentials live only in the company password manager.
- No client names in public portfolios without the client's written consent.
- Personal cloud storage and personal email are never used for work files.
- Access is provisioned on a least-privilege basis.

### 3.3 Employee personal data

Employee personal data is collected only for employment purposes, kept accurate and secure, accessed on a need-to-know basis, and retained per the schedule below. This follows the UAE Personal Data Protection Law (Federal Decree-Law 45/2021 and its 2024 Executive Regulations) and Pakistani constitutional privacy principles. A comprehensive Pakistani data-protection statute is still pending, so Convertt applies the UAE standard group-wide.

| Records | Kept for |
|---|---|
| Employment contracts, NDAs, settlement agreements | 10 years after exit |
| Payroll, tax, EOBI and statutory receipts | 10 years |
| Personnel file (reviews, letters, acknowledgments) | 5 years after exit |
| Recruitment records of unsuccessful candidates | 1 year, then deleted |
| CCTV and access logs | 90 days unless under investigation |
| Exit clearances and asset records | 5 years after exit |

### 3.4 Suspected breach

1. Preserve the evidence.
2. Revoke access immediately.
3. Notify the Founder the same day.
4. Take advice before contacting the individual.

A breach of personal data is assessed within 72 hours (UAE PDPL). Anyone who suspects a breach or phishing reports it to HR within 1 hour of discovery.

### 3.5 At exit

The surviving obligations (confidentiality, IP, 12-month non-solicitation and non-disparagement) are restated in writing with the exit clearance (Form F-10 §6) and acknowledged by the leaver.

## 4. Roles and responsibilities

| Role | Responsibility |
|---|---|
| Every employee | Signs the NDA before access and follows the everyday practice above. |
| HR Manager | Prepares the correct NDA version, keeps the register of signed NDAs, and audits access dates against NDA dates every quarter. |
| IT | Provisions least-privilege access only after the NDA is signed, and revokes it at exit. |
| Founder | Is notified of any suspected breach the same day and decides the response. |

## 5. Compliance and violations

In the UAE, deliberate disclosure of secrets can ground summary dismissal (Art. 44) and criminal exposure (Penal Code Art. 432). In Pakistan, PECA 2016 (as amended 2025) and contract remedies apply. Any access given before an NDA is signed is logged as an incident.

${COMPLIANCE}

## 6. Related policies, procedures and forms

- IT & Acceptable Use Policy
- Code of Conduct & Ethics Policy
- SOP-06 NDA, confidentiality & IP; SOP-10 Offboarding & exit
- Forms F-04 and F-05 Employee NDA & IP Assignment; Form F-10 Exit, Clearance & Final Settlement
`,
  },

  {
    title: 'Anti-Harassment & Equal Opportunity Policy',
    code: 'CVT-POL-303',
    section: '§3.3',
    category: 'CODE_OF_CONDUCT',
    type: 'CODE_OF_CONDUCT',
    requiresAck: true,
    appliesTo: 'Everyone, for and by anyone: employees, contractors, interns, clients and visitors, in any work-connected setting',
    description:
      'Harassment of any kind is prohibited, in the office and online. How the Inquiry Committee works, and how to raise a complaint without retaliation.',
    body: `## 1. Purpose

Everyone at Convertt has the right to work free from harassment and discrimination. This policy applies the widest protection available across Pakistan and the UAE, and sets out exactly how a complaint is raised and handled.

## 2. Scope

Applies to everyone, for and by anyone, in any work-connected setting, including online and remote work.

## 3. Policy statement

### 3.1 What is prohibited

Harassment of any kind (sexual, verbal, physical, psychological or digital) is prohibited.

### 3.2 Pakistan: the Inquiry Committee

- A standing three-member Inquiry Committee: at least one woman, one member of senior management, and one employee representative.
- Constituted under the Protection Against Harassment of Women at the Workplace Act 2010, as amended in 2022, which extends protection to all genders, contractual staff, interns and remote work.
- The committee's names and contacts are displayed in the office, in English and Urdu, together with the Code of Conduct. **This display is a legal requirement**; non-display carries a fine of PKR 25,000 to 100,000.

### 3.3 UAE

- Discrimination on the basis of race, colour, sex, religion, national or social origin, or disability is prohibited (Art. 4, Federal Decree-Law 33/2021).
- Sexual harassment, bullying, and any verbal, physical or psychological violence are prohibited (Art. 14).
- Equal pay for work of equal value applies.
- No one is dismissed for filing a complaint.

### 3.4 Raising a complaint

| Country | Complaints go to | Appeal |
|---|---|---|
| Pakistan | The Inquiry Committee | Punjab Ombudsperson |
| UAE | HR, or the Founder | |

- Complaints are handled confidentially, without retaliation, and with written findings.
- Harassment complaints are never handled informally.

## 4. Roles and responsibilities

| Role | Responsibility |
|---|---|
| Every employee | Treats colleagues with respect and reports harassment they experience or witness. |
| Inquiry Committee (PK) | Investigates complaints, hears both sides, and records written findings. |
| HR Manager | Keeps the committee constituted and displayed, logs every referral in the incident and grievance log, and reports it to the Founder quarterly. Checks the harassment-code display every year. |
| Founder | Receives UAE complaints where appropriate and acts on findings. |

## 5. Compliance and violations

A finding of harassment is misconduct and is acted on through the disciplinary process. Retaliation against anyone who complains or gives evidence is itself a breach of this policy.

${COMPLIANCE}

## 6. Related policies, procedures and forms

- Code of Conduct & Ethics Policy
- Social Media & Public Communication Policy
- SOP-09 Performance, discipline & grievance
- Form F-08 Policy & Code of Conduct Acknowledgment
`,
  },

  {
    title: 'IT & Acceptable Use Policy',
    code: 'CVT-POL-304',
    section: '§3.4 and SOP-05',
    category: 'IT',
    type: 'HR_POLICY',
    requiresAck: true,
    description:
      'Rules for company devices, accounts and systems: acceptable use, security duties, the device security baseline, BYOD, and the monitoring notice.',
    body: `## 1. Purpose

Company devices and accounts carry client data and client access. This policy sets the rules for using them, and the security duties that keep that data safe.

## 2. Scope

All company devices (laptops, monitors, phones, SIMs, access cards), company accounts and software licences, and any personal device approved under BYOD.

## 3. Policy statement

### 3.1 Acceptable use

Company devices and accounts are for business use, with reasonable incidental personal use. The following are prohibited:

- illegal content
- unlicensed software
- crypto-mining
- using a VPN to circumvent client security

### 3.2 Security duties

- Unique passwords, held in the company password manager.
- MFA on every account.
- Lock your screen whenever you step away.
- Report suspected phishing or a breach **within 1 hour** of discovery.

### 3.3 Device security baseline

| Control | Requirement |
|---|---|
| Disk encryption | Full-disk encryption on |
| Passwords | Company password manager enrolled |
| Screen lock | 5 minutes or less |
| Updates | OS updates automatic |
| Client data | Stays in company cloud accounts, never on personal devices |

IT verifies and initials the baseline on Form F-07 before a device is handed over.

### 3.4 Bring your own device (BYOD)

BYOD is discouraged. Where approved, the device must meet the same baseline and accept remote wipe of company accounts.

### 3.5 Looking after company assets

- Assets are issued only against a signed Form F-07, with condition photographed at handover. They remain company property.
- Faults are reported within 24 hours. Repairs go through HR; no self-repair.
- Moving an asset to another person always goes through a new F-07.
- Loss or theft is reported the same day, with a police report where insurance requires one.
- Where policy and law allow, the documented cost of unreturned or negligently damaged assets may be recovered from final settlement: in Pakistan within the 50% cap on total deductions from monthly wages, in the UAE within Art. 25 of the Labour Law.

### 3.6 Access at exit

Client systems are revoked on the last client-work day, internal systems by the end of the last working day, and MFA and shared credentials are rotated within 24 hours of exit.

### 3.7 Monitoring notice

Company systems may be monitored for security and compliance to the extent local law allows. Personal devices are out of scope, except approved BYOD.

## 4. Roles and responsibilities

| Role | Responsibility |
|---|---|
| Every employee | Follows the rules above and reports incidents within the time limits. |
| IT | Applies the security baseline, provisions least-privilege access, and revokes access at exit. |
| HR Manager | Keeps the asset register, reconciles it quarterly (spot-checking at least 25% of assets), and closes every F-07 line at exit. |

## 5. Compliance and violations

${COMPLIANCE}

## 6. Related policies, procedures and forms

- Confidentiality, IP & Data Protection Policy
- SOP-05 Asset assignment & management; SOP-10 Offboarding & exit
- Form F-07 Asset Assignment & Return; Form F-08 Policy & Code of Conduct Acknowledgment
`,
  },

  {
    title: 'Social Media & Public Communication Policy',
    code: 'CVT-POL-305',
    section: '§3.5',
    category: 'CODE_OF_CONDUCT',
    type: 'HR_POLICY',
    requiresAck: false,
    description:
      'Who speaks for Convertt, and what must never be posted publicly: client work, client names, internal matters or workplace disputes.',
    body: `## 1. Purpose

What is posted publicly about Convertt or our clients cannot be taken back. This policy sets who speaks for the company and what stays inside it.

## 2. Scope

All public communication about Convertt, its clients or its people, on any platform, whether posted from a company or a personal account.

## 3. Policy statement

- **Only the Founder speaks for Convertt.**
- Employees do not post client work, client names, internal matters, or workplace disputes publicly.
- No client names in public portfolios without the client's written consent.
- Legitimate grievances use internal channels (HR, or the Founder if it concerns HR), never social media.
- When someone leaves a client-facing role, clients are told by the Founder, not by the leaver.

### Legal exposure

Defamatory or confidential posts can create personal criminal liability:

| Country | Law |
|---|---|
| Pakistan | PECA 2016, as amended by the PECA (Amendment) Act 2025, including offences for false information and online defamation |
| UAE | Cybercrimes Law, Federal Decree-Law 34/2021 |

Convertt's first instrument is always the employment contract and this policy, applied through due process.

## 4. Roles and responsibilities

| Role | Responsibility |
|---|---|
| Every employee | Keeps client and internal matters off public channels. |
| Founder | Is the sole spokesperson, and communicates client-facing departures. |
| HR Manager | Handles any breach through the disciplinary process. |

## 5. Compliance and violations

${COMPLIANCE}

## 6. Related policies, procedures and forms

- Code of Conduct & Ethics Policy
- Confidentiality, IP & Data Protection Policy
- SOP-09 Performance, discipline & grievance
`,
  },

  {
    title: 'Remote Work Policy',
    code: 'CVT-POL-306',
    section: '§3.6 and §1.5',
    category: 'GENERAL',
    type: 'HR_POLICY',
    requiresAck: false,
    description:
      'Convertt is office-first. When working from home is allowed, what is required on a remote day, and why cross-border remote work needs approval.',
    body: `## 1. Purpose

Convertt is office-first. This policy sets when working from home is possible, and what is expected on a remote day so that clients and colleagues notice no difference.

## 2. Scope

All employees in Pakistan and the UAE. Normal working hours in both countries are 10:00 to 19:00, Monday to Friday.

## 3. Policy statement

### 3.1 Approval

- Work from home is by the Reporting Manager's **prior** approval, case by case: day by day, or for a defined period.
- It is **not available during probation**. Limited exceptions apply for UAE hires pending visa or relocation logistics, approved by the Founder.

### 3.2 Requirements on an approved remote day

| Requirement | Standard |
|---|---|
| Availability | Core hours, 11:00 to 16:00 local time |
| Client calls | Camera on |
| Device | Company device only |
| Connection | Secure connection |

### 3.3 Cross-border remote work

Working from a country other than your employment country needs the Founder's approval **in advance**. It has visa and tax consequences.

## 4. Roles and responsibilities

| Role | Responsibility |
|---|---|
| Employee | Requests remote days ahead and meets the requirements above. |
| Reporting Manager | Approves or declines, case by case. |
| Founder | Approves probation exceptions for UAE hires and all cross-border remote work. |
| HR Manager | Records approved remote days in attendance. |

## 5. Compliance and violations

Remote work without prior approval is treated as unauthorised absence from the office.

${COMPLIANCE}

## 6. Related policies, procedures and forms

- IT & Acceptable Use Policy
- SOP-04 Probation & confirmation
`,
  },

  {
    title: 'Compensation Principles Policy',
    code: 'CVT-POL-307',
    section: '§3.7, §1.5 and the Country Annexes',
    category: 'COMPENSATION',
    type: 'HR_POLICY',
    requiresAck: false,
    description:
      'How pay works at Convertt: levels and published bands, private salaries, discretionary bonuses, and the pay and benefits basics in each country.',
    body: `## 1. Purpose

Pay at Convertt should be predictable and fair: everyone can see the range for their level, no one's salary is public, and the rules are the same for everyone. This policy states those principles.

## 2. Scope

All salaries, allowances and bonuses paid by Convertt (Pakistan) and SyeDev LLC FZ (UAE).

## 3. Policy statement

### 3.1 Levels and bands

- Every role maps to a level on the career ladder (see Career Level Framework Policy).
- Every level has a published salary band per location: **PKR for Lahore, AED for Dubai**.
- Offers, increments and promotions land within band. Exceptions need the Founder's written approval.

### 3.2 Pay transparency

- The bands are open. Individual salaries are private between the employee, HR and the Founder.
- Discussing your own pay is never a disciplinary matter, and you may always discuss your own pay with HR.

### 3.3 Salary growth

Salary growth is governed by the Salary Review & Increment Policy: reviews are annual, evidence-based, and land within band.

### 3.4 Bonuses

Performance, Eid, project or milestone, retention, referral and profit-share bonuses are **discretionary** unless a signed agreement states otherwise. Payment in one year never creates an entitlement for the next.

### 3.5 Pay and benefits by country

| Item | Pakistan | UAE |
|---|---|---|
| Pay date | By the 7th of the following month, by bank transfer | 1st of the following month, by bank transfer |
| Salary structure | PKR gross; tax withheld per FBR salaried slabs | Basic stated separately from allowances (gratuity is calculated on basic) |
| Payslip | Every month | Every month |
| Deductions | Lawful, documented, total 50% of monthly wage or less | Within Art. 25 of the Labour Law |
| Retirement | EOBI for all eligible staff (employer 5%, employee 1% of the statutory wage base). No provident fund and no contractual gratuity; to be revisited at about 20 headcount | End-of-service gratuity on basic: 21 days a year for years 1 to 5, 30 days a year after; capped at 2 years' wage |
| Health insurance | | Company-paid for every employee from visa issue; never charged back |
| Overtime | Pre-approved in writing only; paid at 2x ordinary rate | Pre-approved; +25% of basic hourly, +50% between 22:00 and 04:00 |

Pakistan legal watch item: the Punjab Labour Code 2026 may extend statutory gratuity to smaller establishments. Until counsel confirms, contracts stay silent on gratuity.

## 4. Roles and responsibilities

| Role | Responsibility |
|---|---|
| Founder | Sets the bands, approves every offer, increment and promotion, and any out-of-band exception. Approves each payroll run. |
| HR Manager | Publishes the bands internally, checks every salary against its band, and runs payroll inputs. |
| Reporting Manager | Proposes salaries within the budgeted band. |

## 5. Compliance and violations

Any salary outside its band without a written Founder exception is corrected at the next payroll.

## 6. Related policies, procedures and forms

- Career Level Framework Policy
- Salary Band Policy
- Salary Review & Increment Policy
- SOP-08 Payroll & statutory compliance
`,
  },

  {
    title: 'Career Level Framework Policy',
    code: 'CVT-POL-401',
    section: '§4.1',
    category: 'GENERAL',
    type: 'HR_POLICY',
    requiresAck: false,
    description:
      'The five levels every role at Convertt maps to, from Trainee to Lead: what defines each one, and the notice period that goes with it.',
    body: `## 1. Purpose

Every employee should be able to see, at any time, what their role is, what the next level looks like, and exactly what stands between them and it. The level framework is the common scale for that.

## 2. Scope

Every function: CRO and experimentation, design and UI/UX, development, marketing, account management, and operations. Titles vary by function; levels do not.

## 3. Policy statement

### 3.1 The five levels

| Level | Title pattern | What defines it | Notice band |
|---|---|---|---|
| L1 | Trainee / Intern | Learning the fundamentals under close guidance; work is reviewed before it ships. | Per contract |
| L2 | Associate / Junior | Delivers defined tasks with support; building core competence; quality needs review. | 1 month |
| L3 | Specialist (e.g. Designer, Developer, CRO Specialist) | Delivers independently and reliably across most of the role; owns tasks end to end; trusted with client contact. | 1 month |
| L4 | Senior | Handles complex and ambiguous work; sets quality standards; guides L1 to L3; owns client relationships. | 2 months |
| L5 | Lead | Owns outcomes for an area or function; mentors the team; accountable for standards, delivery and client health. | 2 months |

UAE contracts state notice of 30 to 90 days consistent with this rule and the law: 30 days standard, 60 days for Lead and senior client-facing roles.

### 3.2 What growth means

Each step up reflects growth on five dimensions:

1. Technical skill and quality
2. Independence: how much guidance is needed
3. Scope and complexity handled
4. Impact on clients and the company
5. Leadership of others

### 3.3 Earned, not tenure-based

Nothing in the framework is tenure-based. Progression and increments are earned through evidenced performance.

### 3.4 Where your level appears

HR maintains the current level map per function. Every employee's level appears in their contract, confirmation letter, and increment letters.

## 4. Roles and responsibilities

| Role | Responsibility |
|---|---|
| HR Manager | Maintains the level map per function and records each employee's level. |
| Reporting Manager | Assesses work against the level definitions. |
| Founder | Approves the level of every hire and promotion. |

## 5. Related policies, procedures and forms

- Role Scorecard Policy
- Promotion Policy
- Salary Band Policy
`,
  },

  {
    title: 'Role Scorecard Policy',
    code: 'CVT-POL-402',
    section: '§4.2',
    category: 'GENERAL',
    type: 'HR_POLICY',
    requiresAck: false,
    description:
      'Every role has a one-page scorecard. It defines the job ad, the interview, the 30/60/90 plan, probation, appraisals and the evidence for promotion.',
    body: `## 1. Purpose

A scorecard makes a role concrete: what success looks like this year and how it will be measured. It is the single reference used at every stage from hiring to promotion.

## 2. Scope

Every role at Convertt, at every level.

## 3. Policy statement

### 3.1 What a scorecard contains

A one-page scorecard has:

- the role's mission, in one sentence
- three to five measurable outcomes for the year
- the KPIs that evidence them
- the competencies expected at that level

### 3.2 Where it is used

| Stage | How the scorecard is used |
|---|---|
| Hiring (SOP-01) | Written before the role is advertised; becomes the job ad and the interview rubric |
| Onboarding (SOP-03) | Drives the 30/60/90 plan, agreed in writing in week 1 |
| Probation (SOP-04) | The confirmation decision is a scorecard decision on Form F-09 |
| Performance (SOP-09) | Quarterly check-ins and the annual appraisal are made against it |
| Promotion | Defines the evidence needed to move up a level |

### 3.3 No role without a scorecard

No role exists without a scorecard. An employee who cannot see their scorecard should ask HR the same day.

## 4. Roles and responsibilities

| Role | Responsibility |
|---|---|
| HR Manager | Writes each scorecard with the Reporting Manager and keeps it on the role file. |
| Reporting Manager | Owns the scorecard, the 30/60/90 plan and the reviews made against it. |
| Employee | Knows their scorecard and raises it with HR if they cannot see it. |

## 5. Related policies, procedures and forms

- Career Level Framework Policy
- Promotion Policy
- Form F-06 Onboarding Checklist & 30/60/90 Plan; Form F-09 Probation Review & Confirmation
`,
  },

  {
    title: 'Salary Band Policy',
    code: 'CVT-POL-403',
    section: '§4.3',
    category: 'COMPENSATION',
    type: 'HR_POLICY',
    requiresAck: false,
    description:
      'Every level has a published salary band per location. How bands are set and reviewed, and what happens when a salary falls outside one.',
    body: `## 1. Purpose

Published bands let every employee see the floor and ceiling of their own level and the next one, so that pay is predictable and consistent across the team.

## 2. Scope

Every level in every function, in Lahore (PKR) and Dubai (AED).

## 3. Policy statement

### 3.1 Published bands

- Every level in every function has a salary band per location: **PKR for Lahore, AED for Dubai**.
- Bands are published internally, so every employee can see the floor and ceiling of their level and the next.
- Individual salaries stay private.

### 3.2 Setting and reviewing bands

Bands are set by the Founder and reviewed once a year, before the annual increment cycle runs, against:

- market data
- statutory minimum-wage movements
- inflation, a real factor in Pakistan planning

### 3.3 Staying inside the band

Every offer, increment and promotion lands inside the band for the level and location. An out-of-band exception requires the Founder's written approval and a documented reason, and triggers a review of that band at the next cycle.

### 3.4 Keeping the publication current

The internal band publication is updated the same week as any change, so what employees see always matches what payroll runs.

## 4. Roles and responsibilities

| Role | Responsibility |
|---|---|
| Founder | Sets and approves the bands each year; approves any exception in writing. |
| HR Manager | Publishes the bands, checks every new salary against them, and records exceptions. |

## 5. Related policies, procedures and forms

- Compensation Principles Policy
- Salary Review & Increment Policy
- Career Level Framework Policy
`,
  },

  {
    title: 'Promotion Policy',
    code: 'CVT-POL-404',
    section: '§4.4 and §4.5',
    category: 'GENERAL',
    type: 'HR_POLICY',
    requiresAck: false,
    description:
      'Promotion is earned by performing consistently at the next level, then confirmed by the business. The five gates, and what happens to your salary.',
    body: `## 1. Purpose

This policy makes promotion predictable: the same bar for everyone, evidence rather than impressions, and a clear answer on pay.

## 2. Scope

Any move up a level on the Career Level Framework, in any function.

## 3. Policy statement

### 3.1 The rule

Promotion is earned by consistently performing at the next level, then confirmed by the business. A strong appraisal alone does not automatically promote.

### 3.2 The five gates

| Gate | Requirement |
|---|---|
| Evidence | At least two consecutive review periods rated "exceeds" on the current scorecard, with concrete work showing next-level dimensions (independence, scope, impact, leadership). |
| Sponsorship | The Reporting Manager nominates in writing, citing the evidence against the next level's definition. |
| Fairness check | HR reviews for consistency across the team: the same bar for everyone, no favouritism. Internal candidates get first look at open roles. |
| Business need | For L4 and L5 roles, a genuine need must exist (client load, team size). Readiness without a seat is handled honestly: the employee is told, developed, and prioritised for the next opening. |
| Approval and letter | The Founder approves. The promotion letter states the new level, title, band, salary and effective date, and updates the notice period if the new level requires it. |

### 3.3 Promotion increment

Promotion moves the salary at least to the new band's minimum, typically a 10% to 20% increase. This is **in addition to**, not instead of, any earned annual increment.

## 4. Roles and responsibilities

| Role | Responsibility |
|---|---|
| Reporting Manager | Nominates in writing with evidence. |
| HR Manager | Runs the fairness check and issues the letter. |
| Founder | Confirms business need and approves. |

## 5. Related policies, procedures and forms

- Career Level Framework Policy
- Role Scorecard Policy
- Salary Review & Increment Policy
`,
  },

  {
    title: 'Salary Review & Increment Policy',
    code: 'CVT-POL-405',
    section: '§4.5',
    category: 'COMPENSATION',
    type: 'HR_POLICY',
    requiresAck: false,
    description:
      'Every salary is reviewed once a year. The annual cycle, the indicative increment matrix, and the rules for off-cycle increases and recent confirmations.',
    body: `## 1. Purpose

The annual review is the appreciation cycle. It is a fixed commitment of the calendar, not an ad-hoc favour: a review is guaranteed every year, and a raise is earned.

## 2. Scope

Every employee, including anyone on leave at the time of the cycle.

## 3. Policy statement

### 3.1 The annual cycle

| When | What happens |
|---|---|
| By 30 June | Appraisals complete |
| Before any increment is communicated | The Founder approves that year's increment matrix and any band updates, in writing |
| 1 July | Increments take effect, stated in writing |

### 3.2 Indicative increment matrix

| Appraisal rating | Indicative increment (of gross salary) | Notes |
|---|---|---|
| Outstanding / exceeds | 10% to 18% | Plus strongest bonus consideration; promotion case examined |
| Meets expectations | 5% to 9% | The standard, planned-for outcome for solid performance |
| Partially meets | 0% to 4% | Development plan agreed; re-check possible at mid-year |
| Below expectations | 0% | Performance Improvement Plan under SOP-09; no increment while a PIP is open |

The matrix is indicative and approved fresh each year. Exact percentages depend on company performance and affordability. In Pakistan the matrix also takes account of inflation and the statutory minimum-wage movement, so that real pay is protected; in Dubai it references AED market benchmarks for the role.

### 3.3 Rules

- **Promotion increment:** promotion moves the salary at least to the new band's minimum, typically 10% to 20%, in addition to any earned annual increment.
- **Off-cycle increases** are exceptional: a significant change in responsibilities, a documented retention case, or a market correction. Each requires the Founder's written approval.
- **Increment letters** state the new gross salary, level and band position, effective date, and the rating it reflects.
- **No carry-over entitlement:** an increment in one year creates no entitlement for the next.
- **Recently confirmed employees:** anyone confirmed less than 6 months before the cycle is pro-rated or deferred to the next cycle. This is stated at confirmation, so there are no surprises.
- Deferred or zero increments are documented with the reason and communicated one-to-one, never by silence.

## 4. Roles and responsibilities

| Role | Responsibility |
|---|---|
| Reporting Manager | Completes appraisals by 30 June. |
| HR Manager | Reviews every employee, checks each new salary against its band, issues letters before the effective pay run, and updates payroll, tax withholding and the EOBI base in the same cycle. |
| Founder | Approves the matrix, band updates and any exception in writing. |

## 5. Related policies, procedures and forms

- Compensation Principles Policy
- Salary Band Policy
- Promotion Policy
- SOP-09 Performance, discipline & grievance
`,
  },

  {
    title: 'Career Development Support Policy',
    code: 'CVT-POL-406',
    section: '§4.6',
    category: 'GENERAL',
    type: 'HR_POLICY',
    requiresAck: false,
    description:
      'Growth is supported, not just measured: development conversations, stretch work and mentoring, and a learning budget aimed at the next level.',
    body: `## 1. Purpose

Career clarity only helps if people are supported in closing the gap to the next level. This policy sets out what that support is.

## 2. Scope

Every employee, at every level.

## 3. Policy statement

- Every employee can request a development conversation with their manager or HR **at any time**.
- Managers are expected to give stretch work, feedback and mentoring toward the next level.
- The learning budget, under the Learning & Development Policy, is spent against the gap between the employee's current scorecard and the next level's expectations.
- Career clarity, salary bands, scorecards and increment history will surface in the employee portal as it comes online.

## 4. Roles and responsibilities

| Role | Responsibility |
|---|---|
| Employee | Asks for development conversations and uses the learning budget toward the next level. |
| Reporting Manager | Provides stretch work, feedback and mentoring. |
| HR Manager | Holds development conversations on request and aligns learning spend to scorecard gaps. |

## 5. Related policies, procedures and forms

- Learning & Development Policy
- Career Level Framework Policy
- Role Scorecard Policy
`,
  },
]

// ─── Run ──────────────────────────────────────────────────────────────────────

async function main() {
  const apply = process.argv.includes('--apply')
  const prisma = new PrismaClient()

  const hrUser = await prisma.user.findUnique({ where: { email: 'hr@convertt.co' }, select: { id: true } })
  const ceo = await prisma.employee.findFirst({
    where: { fullName: 'Syed Asghar', designation: 'Chief Executive Officer' },
    select: { id: true, fullName: true, user: { select: { id: true } } },
  })
  if (!hrUser || !ceo) throw new Error(`Missing ${!hrUser ? 'hr@convertt.co user' : 'CEO employee record'}`)

  const titles = POLICIES.map((p) => p.title)
  const existing = await prisma.policyDocument.findMany({
    where: { title: { in: titles } },
    select: { id: true, title: true },
  })
  const existingByTitle = new Map(existing.map((e) => [e.title, e.id]))
  const toArchive = await prisma.policyDocument.findMany({
    where: { title: { in: Object.keys(SUPERSEDED) }, status: { not: 'ARCHIVED' } },
    select: { id: true, title: true, status: true, _count: { select: { acknowledgments: true } } },
  })

  console.log(`Approver: ${ceo.fullName} (employee ${ceo.id}${ceo.user ? `, user ${ceo.user.id}` : ', no login'})`)
  console.log(`\n${POLICIES.length} policies:`)
  for (const p of POLICIES) {
    console.log(`  ${existingByTitle.has(p.title) ? 'update' : 'create'}  ${p.code}  ${p.title}`)
  }
  console.log(`\n${toArchive.length} superseded policies to archive:`)
  for (const t of toArchive) {
    console.log(`  archive  ${t.title}  (${t.status}, ${t._count.acknowledgments} acks) → ${SUPERSEDED[t.title]}`)
  }

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to write.')
    await prisma.$disconnect()
    return
  }

  const now = new Date()
  await prisma.$transaction(
    async (tx) => {
      for (const p of POLICIES) {
        const data = {
          title: p.title,
          category: p.category,
          type: p.type,
          description: p.description,
          content: header(p) + '\n' + p.body + footer(p),
          version: VERSION,
          effectiveDate: EFFECTIVE,
          audience: 'ALL',
          requiresAck: p.requiresAck,
          status: 'ACTIVE',
          reviewerIds: [ceo.id],
          approvedAt: now,
          approvedById: ceo.user?.id ?? null,
          activatedAt: now,
          activatedById: hrUser.id,
          publishedAt: now,
          archivedAt: null,
          rejectedAt: null,
          rejectedById: null,
          rejectionReason: null,
        }
        const id = existingByTitle.get(p.title)
        const saved = id
          ? await tx.policyDocument.update({ where: { id }, data })
          : await tx.policyDocument.create({ data })
        await tx.policyReview.upsert({
          where: { policyId_reviewerId: { policyId: saved.id, reviewerId: ceo.id } },
          create: {
            policyId: saved.id,
            reviewerId: ceo.id,
            status: 'APPROVED',
            comment: 'Approved by the CEO; recorded by HR',
            reviewedAt: now,
          },
          update: { status: 'APPROVED', comment: 'Approved by the CEO; recorded by HR', reviewedAt: now },
        })
      }
      if (toArchive.length) {
        await tx.policyDocument.updateMany({
          where: { id: { in: toArchive.map((t) => t.id) } },
          data: { status: 'ARCHIVED', archivedAt: now },
        })
      }
    },
    { timeout: 60_000 },
  )

  console.log(`\nWrote ${POLICIES.length} ACTIVE policies and archived ${toArchive.length}.`)
  await prisma.$disconnect()
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}

module.exports = { POLICIES, header, footer }

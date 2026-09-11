/**
 * Load the rest of the HR Playbook (CVT-HR-PB-001) into the Policies module:
 * the ten lifecycle procedures (Part 2, SOP-01 to SOP-10) and the two
 * Country Annexes (Part 5), in the same layout as the Part 3–4 policies
 * loaded by import-playbook-policies.cjs.
 *
 *   node scripts/import-playbook-sops.cjs            # dry run — prints the plan
 *   node scripts/import-playbook-sops.cjs --apply    # writes
 *
 * Same rules as the first import: ACTIVE, the CEO's (Syed Asghar) approval
 * recorded as a PolicyReview, no announcement or per-employee email, and the
 * older June 2026 policies on the same subject ARCHIVED rather than deleted.
 * Idempotent: matched on title.
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

const EVERYONE = ['EMPLOYEE', 'LEAD', 'MANAGER', 'EXECUTIVE', 'FINANCE']
const HIRING_MANAGERS = ['LEAD', 'MANAGER', 'EXECUTIVE']
const PAYROLL_READERS = ['FINANCE', 'EXECUTIVE']

/** Older standalone policies these replace, and by what. */
const SUPERSEDED = {
  'Probation & Confirmation Policy': 'Probation & Confirmation Procedure (SOP-04)',
  'Performance Appraisal & KPI Policy': 'Performance, Discipline & Grievance Procedure (SOP-09)',
  'Exit & Offboarding Policy': 'Offboarding & Exit Procedure (SOP-10)',
  'Provident Fund & Gratuity Policy': 'Pakistan Employment Terms (Annex PK)',
}

// ─── Document scaffold (same layout as import-playbook-policies.cjs) ─────────

function header(p) {
  return [
    '| Document detail | |',
    '|---|---|',
    `| ${p.idLabel} | ${p.code} |`,
    '| Owner | HR Manager |',
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
    'Where this document and the HR Playbook differ, the Playbook prevails. Where either conflicts with the Country Annex or mandatory local law, the Annex and the law prevail for employees in that country.',
  ].join('\n')
}

const CHECKLIST_NOTE =
  'No lifecycle event is complete until its checklist is signed. Every item below is ticked, evidenced, and the checklist signed and dated by the HR Manager and filed in the personnel file. An open item is escalated to the Founder within 24 hours.'

// ─── The documents ────────────────────────────────────────────────────────────

const DOCS = [
  {
    title: 'Hiring & Recruitment Procedure (SOP-01)',
    code: 'CVT-SOP-01',
    idLabel: 'Procedure ID',
    section: '§2.1 (SOP-01)',
    category: 'GENERAL',
    type: 'HR_POLICY',
    audienceRoles: HIRING_MANAGERS,
    appliesTo: 'Every hire in Lahore or Dubai, at every level; run by HR with the Reporting Manager and the Founder',
    description:
      'How a role is approved, assessed and filled: headcount approval, the scorecard, structured interviews, reference and background checks, and the decision.',
    body: `## 1. Purpose

Hiring starts with a written need, not a CV. This procedure makes sure every hire is approved before sourcing begins, assessed against the same scorecard by every interviewer, and checked before any offer is made.

## 2. Scope

Every role at Convertt, in Lahore or Dubai, at every level including trainees and interns.

## 3. Procedure

1. **Headcount approval.** The Reporting Manager proposes the role to the Founder with its purpose, level (per the career ladder), location (Lahore or Dubai), and budgeted salary within the published band. No sourcing begins without written (email) approval.
2. **Role scorecard.** HR and the manager write a one-page scorecard: mission, three to five measurable outcomes for year one, and required competencies. It becomes the job ad, the interview rubric, and later the 30/60/90 plan and probation criteria.
3. **Structured interviews.** At minimum: HR screen (30 minutes), then a skills or portfolio interview with the manager, then a practical task or work sample (paid if it takes more than 3 hours), then a final values conversation with the Founder. Every interviewer scores against the scorecard in writing within 24 hours.
4. **Reference and background checks.** Before any offer: two professional references (at least one a former direct manager) contacted by HR, with notes filed; identity and education verified. UAE candidates are also screened for visa eligibility and any UAE labour ban. Consent for the checks is obtained on the application form.
5. **Decision.** The Founder approves the specific candidate, level and salary. **Verbal promises are prohibited** — only the written offer commits the company.

## 4. HR checklist — before an offer is made

${CHECKLIST_NOTE}

| Check | What must be verified | Owner | Evidence |
|---|---|---|---|
| Written headcount approval on file | Email from the Founder stating role, level, location and budget. Never rely on a verbal go-ahead. | HR | Approval email in the role file |
| Role scorecard finalised | Outcomes are measurable; level matches the career ladder; salary band attached. | HR and Manager | Scorecard v1.0 in the role file |
| Interview scores complete | Every interviewer has submitted written scores; no unexplained gaps between interviewers. | HR | Scoring sheets |
| Two references verified | Spoke to the references directly (reference letters alone do not count). Confirm dates, role, reason for leaving, and the rehire question. Watch for dates that conflict with the CV. | HR | Dated reference call notes |
| Identity and education verified | Pakistan: original CNIC sighted and copied; degree checked (HEC verification for degree-critical roles). UAE: passport valid for at least 6 months; attested certificates if the free zone requires them for the visa. | HR | Verified copies in the file |
| Candidate consent to checks | Signed consent (application form or email) covering references, background and document verification. Required for data-protection compliance. | HR | Signed consent |
| UAE only: visa eligibility screen | Nationality and visa pathway confirmed with the free zone; no existing employment ban; education documents ready for permit processing before a start date is committed. | HR | Free zone pre-check note |

## 5. Roles and responsibilities

| Role | Responsibility |
|---|---|
| Reporting Manager | Proposes the role, co-writes the scorecard, runs the skills interview, and scores in writing. |
| HR Manager | Runs the screen, the references and all checks, and certifies the checklist. |
| Founder | Approves headcount, holds the values conversation, and approves the candidate, level and salary. |

## 6. Related policies and forms

- Role Scorecard Policy; Salary Band Policy; Career Level Framework Policy
- Offer & Pre-joining Procedure (SOP-02)
`,
  },

  {
    title: 'Offer & Pre-joining Procedure (SOP-02)',
    code: 'CVT-SOP-02',
    idLabel: 'Procedure ID',
    section: '§2.2 (SOP-02)',
    category: 'GENERAL',
    type: 'HR_POLICY',
    audienceRoles: HIRING_MANAGERS,
    appliesTo: 'Every accepted candidate, from the written offer to Day 1',
    description:
      'What a written offer contains in each country, and everything HR must have done between acceptance and the first day.',
    body: `## 1. Purpose

The offer letter is a summary. The employment contract and the NDA are the binding documents. This procedure makes sure the right documents, for the right legal entity, are ready and signed on time, and that nothing is handed over before the NDA is signed.

## 2. Scope

Every accepted candidate, from the written offer to Day 1. Use **Form F-01** (Pakistan) or **Form F-02** (UAE).

## 3. Procedure

### 3.1 The offer (both countries)

The offer states: position and level; reporting line; location and work model; gross salary and any allowances; working hours; probation terms; notice periods; a leave summary; contingencies (references, documents, visa where applicable); an acceptance deadline of 5 working days; and the list of documents the candidate must bring.

The employment contract and NDA must be signed on or before Day 1. **No system access, asset or client work is ever given before the NDA is signed.**

### 3.2 Country specifics

| Pakistan | UAE |
|---|---|
| Salary stated in PKR gross; tax withheld per FBR slabs. | Offer is conditional on visa and permit issuance. |
| The Punjab Labour Code 2026 makes a written appointment letter mandatory for every worker; employing without one is an offence. | Contract is fixed-term (renewable), on the free zone template naming SyeDev LLC FZ. |
| The contract states EOBI registration. | Salary is split into basic plus allowances, with basic stated explicitly (gratuity is calculated on basic). |
| | Probation is at most 6 months. |
| | Mandatory health insurance is arranged by the company before visa stamping. |

## 4. HR checklist — between acceptance and Day 1

${CHECKLIST_NOTE}

| Check | What must be verified | Owner | Evidence |
|---|---|---|---|
| Offer approved and issued correctly | Correct legal entity named; salary within band; no clause conflicts with the Country Annex; acceptance deadline stated. | HR | Offer signed by candidate and Founder |
| Document pack collected | Pakistan: CNIC copy, photo, latest degree or transcript, experience letters, last 3 salary slips, bank IBAN, emergency contact. UAE: passport copy, photo, attested degree (if required), current visa or Emirates ID status, bank IBAN. | HR | Form F-03 completed and verified |
| Employment contract prepared | Pakistan: appointment letter per the Labour Code 2026. UAE: free zone contract naming SyeDev LLC FZ, basic salary stated, and term, probation and notice per Annex UAE. | HR | Contract draft reviewed |
| NDA prepared (correct country version) | F-04 for Pakistan, F-05 for UAE. Check name, CNIC or passport number, designation and date. Schedule signing for Day 1 at the latest. | HR | NDA ready for signature |
| UAE only: permit, visa and insurance sequence | Free zone employment permit applied for; medical and Emirates ID biometrics booked; health insurance active before visa stamping; copies of every submission and receipt kept. | HR | Permit and visa tracker updated |
| Payroll and statutory setup queued | Pakistan: added to payroll, EOBI registration (within 30 days), tax withholding set from the declaration. UAE: added to payroll with pay date on the 1st, gratuity accrual started, ILOE decision recorded. | HR | Payroll change log |
| Workspace, accounts and assets staged | Email, project tools and password manager provisioned at least one day early with least-privilege access (released only once the NDA is signed); laptop imaged and recorded in the asset register (SOP-05); desk ready. | HR and IT | Provisioning checklist in F-06 |
| Start-date confirmation sent | Written note with date, time, address, dress code, first-day agenda, and who will meet them. | HR | Email on file |

## 5. Related policies and forms

- Hiring & Recruitment Procedure (SOP-01); Onboarding Procedure (SOP-03)
- Forms F-01, F-02 (offer letters), F-03 (employee information and document verification), F-04 and F-05 (NDA)
`,
  },

  {
    title: 'Onboarding Procedure — Day 1 to Day 90 (SOP-03)',
    code: 'CVT-SOP-03',
    idLabel: 'Procedure ID',
    section: '§2.3 (SOP-03)',
    category: 'GENERAL',
    type: 'HR_POLICY',
    audienceRoles: EVERYONE,
    description:
      'What happens on Day 1, in week 1, and at Day 30, 60 and 90 — legal first, then context, then a measured ramp to confirmation.',
    body: `## 1. Purpose

Onboarding gets the legal essentials signed before anything else, gives a new hire the context to do the job, and measures their ramp-up so the confirmation decision rests on evidence.

## 2. Scope

Every new hire. Onboarding runs from **Form F-06**, which is opened before Day 1 and closed at confirmation.

## 3. Procedure

1. **Day 1 — legal first.** Before anything else: employment contract signed; NDA (F-04 or F-05) signed and witnessed; Code of Conduct and policy acknowledgment (F-08) signed; asset assignment form (F-07) signed on handover of the laptop and accessories. Then the welcome: office tour, introductions, workstation and accounts.
2. **Week 1 — context.** The manager walks through the role scorecard and the 30/60/90 plan; a buddy is assigned; the new hire reads the HR Playbook and the client-confidentiality briefing; HR verifies that statutory registrations are in motion.
3. **Day 30, 60 and 90 — measured ramp.** Written check-ins against the 30/60/90 goals at each gate. Concerns are documented early. The Day-90 review (Pakistan) or pre-probation-end review (UAE) feeds the confirmation decision (SOP-04).

## 4. HR checklist — onboarding

${CHECKLIST_NOTE}

| Check | What must be verified | Owner | Evidence |
|---|---|---|---|
| Contract and NDA signed before any access | No email, tool, client file or asset is released until both are signed. If signing slips, access stays locked and the Founder is told the same day. | HR | Signed originals filed (F-04 or F-05) |
| Policy acknowledgment signed | F-08 lists the Playbook version, the Code of Conduct, IT acceptable use and the anti-harassment policy. The employee signs one acknowledgment covering all of them. | HR | F-08 in the personnel file |
| Assets issued against signature | Every item serial-numbered in the asset register and on F-07; condition photographed at handover. | HR and IT | F-07 and photos |
| Statutory registrations completed | Pakistan: EOBI registration confirmed (keep the EOBI card or number) and tax declaration collected. UAE: contract registered with the free zone; Emirates ID and labour card copies filed when issued. | HR | Registration numbers in the HR system |
| 30/60/90 plan agreed in writing | Signed by the employee and manager within week 1; goals map to the role scorecard. | Manager | Plan attached to F-06 |
| Personnel file complete at Day 7 | Run the F-03 index: every document present, verified and legible. A file with gaps is escalated, not parked. | HR | F-03 sign-off |

## 5. Related policies and forms

- Role Scorecard Policy; Probation & Confirmation Procedure (SOP-04)
- Forms F-03, F-04/F-05, F-06 (onboarding checklist and 30/60/90 plan), F-07, F-08
`,
  },

  {
    title: 'Probation & Confirmation Procedure (SOP-04)',
    code: 'CVT-SOP-04',
    idLabel: 'Procedure ID',
    section: '§2.4 (SOP-04)',
    category: 'GENERAL',
    type: 'HR_POLICY',
    audienceRoles: EVERYONE,
    description:
      'Probation length and notice in each country, and how confirmation is decided on a scorecard review — never by a date that silently passes.',
    body: `## 1. Purpose

Confirmation is a scorecard decision made on Form F-09, never a date that silently passes. This procedure sets probation terms in each country and the steps that make sure every probationer gets a timely, evidenced decision.

## 2. Scope

Every new hire during their probation period.

## 3. Probation terms

| | Pakistan | UAE |
|---|---|---|
| Length | Three (3) months, extendable once at the Company's discretion | As stated in the contract, never more than six (6) months; not extendable beyond six and not renewable |
| Notice during probation | 14 days either side (or as the contract states) | Employer termination: 14 days' written notice. Employee resigning to join another UAE employer: 1 month's written notice; leaving the UAE: 14 days (Art. 9, Federal Decree-Law 33/2021) |
| Work from home | Not permitted during probation | Not permitted, except limited exceptions for hires pending visa or relocation, approved by the Founder |

**Decision gate.** Outcomes are: confirm, extend (Pakistan only, once), or exit with the correct notice.

## 4. HR checklist — probation

${CHECKLIST_NOTE}

| Check | What must be verified | Owner | Evidence |
|---|---|---|---|
| Review scheduled ahead of time | Pakistan: F-09 review meeting held by day 80. UAE: held at least 21 days before probation ends, so a 14-day notice can still be served inside probation if needed. | HR | Calendar and F-09 date |
| Scorecard evidence attached | Ratings reference the 30/60/90 goals and concrete work, not impressions. Any "extend" or "exit" recommendation must cite documented feedback given earlier. | Manager | Completed F-09 |
| Outcome letter issued | Confirmation, extension (with new end date and reasons), or termination letter with the correct statutory notice. Silence is treated as risk: in Pakistan, courts may treat a probationer kept past probation as confirmed. | HR | Letter in the file |
| Post-confirmation updates | Leave accrual switches to confirmed rates; benefits activated; notice period per role level recorded in the HR system. | HR | HR system change log |

Employees confirmed less than 6 months before the annual increment cycle are pro-rated or deferred to the next cycle; this is stated at confirmation.

## 5. Related policies and forms

- Role Scorecard Policy; Salary Review & Increment Policy
- Onboarding Procedure (SOP-03)
- Form F-09 Probation Review & Confirmation
`,
  },

  {
    title: 'Asset Assignment & Management Procedure (SOP-05)',
    code: 'CVT-SOP-05',
    idLabel: 'Procedure ID',
    section: '§2.5 (SOP-05)',
    category: 'IT',
    type: 'HR_POLICY',
    audienceRoles: EVERYONE,
    description:
      'How company equipment is recorded, issued against a signed form, looked after, reconciled every quarter, and recovered at exit.',
    body: `## 1. Purpose

Everything the company hands to an employee — laptop, charger, monitor, phone, SIM, access card, software licence — is recorded twice: once in the central asset register, and once on the employee's signed Form F-07. The two must always reconcile.

## 2. Scope

All company assets issued to employees, trainees, interns and contractors.

## 3. Procedure

- **Asset register.** One line per asset: asset tag, type, make and model, serial number, purchase date and cost, current condition, current holder, and status (in use, in stock, repair, retired). HR reconciles the register quarterly and at every exit.
- **Issue.** Assets are issued only against a signed F-07, with condition photographed. The form states the employee's duty of care, that assets remain company property, permitted personal use, and the consequences of loss or negligent damage.
- **In-life.** Faults are reported within 24 hours. Repairs go through HR (no self-repair). Moving an asset between people always goes through a new F-07. Loss or theft is reported the same day, with a police report where insurance requires one.
- **Security baseline.** Company laptops run full-disk encryption, a password manager, screen lock and automatic updates. Client data stays in company cloud accounts, never on personal devices. BYOD is discouraged; where approved, the device must meet the same baseline and accept remote wipe of company accounts.
- **Recovery of losses.** Where policy and law allow, the documented cost of unreturned or negligently damaged assets may be recovered from final settlement: in Pakistan, total deductions may not exceed 50% of monthly wages (Punjab Labour Code 2026); in the UAE, deductions must fall within Art. 25 of the Labour Law. The signed F-07 is the evidence that makes this enforceable.

## 4. HR checklist — assets

${CHECKLIST_NOTE}

| Check | What must be verified | Owner | Evidence |
|---|---|---|---|
| Register entry before issue | No asset leaves stock without a tag and a register line. The serial number on the register matches the physical item and F-07. | HR and IT | Register line and F-07 |
| Signed F-07 with condition photos | Screen, body and accessories photographed at handover and stored with the form. This settles "it was already scratched" disputes at exit. | HR | F-07 and photo folder |
| Security baseline applied | Encryption on, password manager enrolled, screen lock 5 minutes or less, OS updates automatic. Verified and initialled by IT on F-07 before handover. | IT | F-07 security section |
| Quarterly reconciliation | Physical spot-check of at least 25% of assets each quarter; every register line has a live holder or a stock location. Discrepancies escalated within 48 hours. | HR | Quarterly reconciliation note |
| Exit recovery | All F-07 lines closed on the exit clearance (F-10) before final settlement is released. | HR | F-10 asset section |

## 5. Related policies and forms

- IT & Acceptable Use Policy
- Offboarding & Exit Procedure (SOP-10)
- Form F-07 Asset Assignment & Return; Form F-10 Exit, Clearance & Final Settlement
`,
  },

  {
    title: 'NDA, Confidentiality & IP Procedure (SOP-06)',
    code: 'CVT-SOP-06',
    idLabel: 'Procedure ID',
    section: '§2.6 (SOP-06)',
    category: 'SECURITY',
    type: 'HR_POLICY',
    audienceRoles: EVERYONE,
    appliesTo: `${APPLIES_TO_ALL}, and every contractor or freelancer who touches Convertt or client information`,
    description:
      'Which NDA each person signs, how it is signed and witnessed, the obligations that continue during employment, and what happens on a suspected breach.',
    body: `## 1. Purpose

Everyone who touches Convertt or client information signs an NDA before access. This procedure covers which version is used, how it is executed and recorded, and how a suspected breach is handled.

## 2. Scope

Employees sign **F-04** (Pakistan) or **F-05** (UAE); contractors sign the contractor variant with a services agreement. The NDA versions are updated for 2026 law in both countries and cover: confidentiality without time limit for trade secrets; work-for-hire and written IP assignment with moral-rights consent; 12-month non-solicitation of clients and staff; non-disparagement; device and data rules; return-and-destruction duties; and remedies.

## 3. Procedure

- **Which version.** The employing entity decides. Convertt (Pakistan) employees sign F-04 (Lahore governing law); SyeDev LLC FZ employees sign F-05 (UAE governing law). Never mix.
- **Execution.** Signed in wet ink or through a reputable e-sign platform on or before Day 1. Pakistan copies are witnessed by two adults with CNIC numbers. The employee receives a countersigned copy; the original is filed in the personnel file with a scan in the HR drive.
- **Living obligations.** Access is provisioned least-privilege; client credentials live only in the company password manager; secondary employment requires written disclosure (Code of Conduct & Ethics Policy); the exit process (SOP-10) re-serves the surviving obligations in writing.
- **Breach response.** On a suspected breach: preserve the evidence, revoke access immediately, notify the Founder the same day, and take advice before contacting the individual. In the UAE, deliberate disclosure of secrets can also ground summary dismissal (Art. 44) and criminal exposure (Penal Code Art. 432); in Pakistan, PECA 2016 (as amended 2025) and contract remedies apply.

## 4. HR checklist — NDA and confidentiality

${CHECKLIST_NOTE}

| Check | What must be verified | Owner | Evidence |
|---|---|---|---|
| Correct version, correctly completed | Legal entity, employee details (CNIC or passport), designation and date all filled in before signature; no blanks on the signed copy. | HR | Signed NDA |
| Signed before access — no exceptions | The account-provisioning date is cross-checked against the NDA date at each quarterly audit. Any access before signature is logged as an incident. | HR | Quarterly audit note |
| Witnesses recorded (Pakistan) | Two witnesses with names and CNIC numbers on the signature page. | HR | NDA signature page |
| Register of signed NDAs | One line per signatory (employees, contractors, interns): name, version signed, date, where filed. Reviewed quarterly for gaps against the headcount and contractor list. | HR | NDA register |
| Exit re-service | Surviving obligations letter issued with the clearance (F-10 §6) and acknowledged by the leaver. | HR | Signed F-10 |

## 5. Related policies and forms

- Confidentiality, IP & Data Protection Policy; IT & Acceptable Use Policy
- Forms F-04 and F-05 Employee NDA & IP Assignment; Form F-10
`,
  },

  {
    title: 'Leave Administration Procedure (SOP-07)',
    code: 'CVT-SOP-07',
    idLabel: 'Procedure ID',
    section: '§2.7 (SOP-07) and the Country Annexes',
    category: 'LEAVE',
    type: 'LEAVE_POLICY',
    audienceRoles: EVERYONE,
    description:
      'How to request and approve leave, the notice and medical-certificate rules, and a side-by-side summary of leave entitlements in Pakistan and the UAE.',
    body: `## 1. Purpose

Entitlements are set by the Country Annexes. How leave is requested, approved and recorded is the same everywhere, and is set out here.

## 2. Scope

All employees, probationers, trainees and interns in Pakistan and the UAE.

## 3. Procedure

- **Planned leave** is requested in writing at least 5 working days ahead (2 days' notice per day of leave for longer blocks).
- **Emergency and sick leave** are notified before 11:00 on the first day. A medical certificate is needed for sick absences of 2 or more consecutive days. In the UAE, a certificate is required to claim statutory sick pay, with notice within 3 days.
- **Approval.** The Reporting Manager approves; HR records the balance the same week. Client-facing staff arrange cover before approval.
- **Sandwich rule.** Applies to unapproved bridging of holidays.
- **Lapse, carry-forward and encashment.** Monthly-accrual days lapse if unused and have no cash value. Annual leave carry-forward and encashment follow the Country Annex.
- **Records.** Leave records are part of the statutory registers. Digital registers are mandatory in Punjab for establishments with 10 or more employees; keep them current, not reconstructed.

## 4. Leave entitlements at a glance

| Leave | Pakistan | UAE |
|---|---|---|
| During probation | 2 paid days a month (casual and sick pool); lapse monthly | Annual leave accrues at 2 days a month after 6 months in year one |
| Monthly pool (confirmed) | 2 paid days a month (casual and sick pool); lapse monthly | Not applicable |
| Annual leave | 14 working days after 12 months' service; carry forward up to 14 days; encashment up to 7 days at exit | 30 calendar days a year from year one; unused statutory leave encashed at basic on exit |
| Sick leave | From the monthly pool | After probation, up to 90 days a year: 15 full pay, 30 half pay, 45 unpaid |
| Maternity | 12 weeks paid (6 before and 6 after birth); no dismissal during leave | 60 days (45 full pay and 15 half pay); up to 45 more unpaid for illness; nursing breaks for 6 months |
| Paternity / parental | 5 working days paid (Convertt benefit) | 5 paid days per parent within 6 months of birth |
| Bereavement | Not set in the Playbook | 5 days (spouse); 3 days (close family) |
| Study | Not set in the Playbook | 10 days after 2 years (accredited UAE institution) |
| Public holidays | Punjab-notified festival holidays (about 10 a year), listed each January | Not set in the Playbook |

## 5. Roles and responsibilities

| Role | Responsibility |
|---|---|
| Employee | Requests leave with the notice above and provides certificates when required. |
| Reporting Manager | Approves or declines, and confirms cover for client-facing staff. |
| HR Manager | Records balances the same week and keeps the leave register current. |

## 6. Related documents

- Pakistan Employment Terms (Annex PK); UAE Employment Terms (Annex UAE)
`,
  },

  {
    title: 'Payroll & Statutory Compliance Procedure (SOP-08)',
    code: 'CVT-SOP-08',
    idLabel: 'Procedure ID',
    section: '§2.8 (SOP-08) and §6.2',
    category: 'COMPENSATION',
    type: 'HR_POLICY',
    audienceRoles: PAYROLL_READERS,
    appliesTo: 'Every monthly payroll run for Convertt (Pakistan) and SyeDev LLC FZ (UAE)',
    description:
      'The monthly payroll run for each entity: cut-off, approval, pay dates, tax and EOBI deposits, UAE gratuity accrual, payslips, and the checklist behind each run.',
    body: `## 1. Purpose

Everyone is paid correctly and on time, statutory deposits are made by their deadlines, and every deduction is lawful and documented.

## 2. Scope

Payroll is run once a month per entity, with a fixed cut-off on the **20th** for changes. The HR Manager owns the input file; the Founder approves the run.

## 3. Country rules

| | Rule |
|---|---|
| Pakistan — pay date | Wages paid by the 7th of the following month (Punjab Labour Code 2026), by bank transfer, with a payslip for every employee. |
| Pakistan — withholdings | Income tax under s.149 Income Tax Ordinance 2001 at current FBR salaried slabs, deposited by the 7th of the month after deduction, with monthly statements filed. EOBI contributions (employer 5% and employee 1% of the statutory wage base) paid monthly. PESSI where registered. |
| UAE — pay date | Salaries due on the 1st of the following month. As a free zone entity Convertt follows the free zone's payroll rules and adopts the 1st-of-month discipline and bank-transfer evidence as best practice (Ministerial Resolution 340/2026 tightened WPS timelines for MOHRE-registered employers from 1 June 2026). |
| UAE — accruals and cover | End-of-service gratuity accrued monthly on basic salary (21 days a year for years 1 to 5; 30 days a year after). Health insurance active for every employee from visa issue. ILOE unemployment insurance per Annex UAE. |
| Both | Payslips issued every month; payroll register retained; every deduction lawful, documented and within statutory caps (Pakistan: 50% of monthly wage or less; UAE: per Art. 25). |

## 4. HR checklist — monthly payroll run

| Check | What must be verified | Owner | Evidence |
|---|---|---|---|
| Input file reconciled | Headcount matches the HR system; joiners and leavers pro-rated; overtime pre-approved and at the statutory rate; leave without pay applied. | HR | Signed input sheet |
| Founder approval before release | The Founder signs off the net-pay total and any exceptional payment (bonus, settlement, advance). | Founder | Approval email |
| Pakistan statutory deposits on time | Tax deposited and PSID retained; EOBI paid and receipt filed; deadlines diarised (7th). | HR | Monthly receipts folder |
| UAE payment evidence | Transfer on or before the 1st; bank confirmations retained; gratuity accrual ledger updated. | HR | Bank records and accrual ledger |
| Payslips delivered | Every employee, every month, showing gross, each deduction, and net. | HR | Payslip archive |

## 5. Compliance calendar

| When | Pakistan | UAE |
|---|---|---|
| Monthly | Pay by the 7th; deposit withheld tax by the 7th (retain PSID); EOBI contribution and receipt; payslips; registers updated | Pay by the 1st; payslips; gratuity accrual ledger; insurance roster check |
| Annually | Minimum-wage and EOBI rate check (July, after the budget) | Insurance renewals |
| On event | EOBI joiner and leaver filings | Gratuity payment within 14 days of exit |

## 6. Related documents

- Compensation Principles Policy; Salary Review & Increment Policy
- Pakistan Employment Terms (Annex PK); UAE Employment Terms (Annex UAE)
`,
  },

  {
    title: 'Performance, Discipline & Grievance Procedure (SOP-09)',
    code: 'CVT-SOP-09',
    idLabel: 'Procedure ID',
    section: '§2.9 (SOP-09)',
    category: 'GENERAL',
    type: 'HR_POLICY',
    audienceRoles: EVERYONE,
    description:
      'The performance cycle and PIPs, the due-process steps for discipline in Pakistan and the UAE, and how to raise a grievance.',
    body: `## 1. Purpose

Performance is managed against the role scorecard, discipline follows due process, and every employee has a clear route to raise a grievance and get an answer.

## 2. Scope

All employees in Pakistan and the UAE.

## 3. Performance

- **Cycle.** Quarterly check-ins against the role scorecard, and an annual written appraisal that feeds increments (within the published band) and promotion cases.
- **Performance Improvement Plan (PIP).** Runs 30 to 60 days, with written goals, weekly check-ins and a clear outcome. No increment is paid while a PIP is open.

## 4. Discipline

### Pakistan

Misconduct follows due process:

1. Written show-cause notice.
2. The employee's written reply.
3. An impartial domestic inquiry with a hearing.
4. A reasoned written order.

Termination simpliciter (no stigma) needs only contractual notice. Skipping the inquiry for a misconduct dismissal is the classic error that loses cases.

### UAE

- Sanctions per Art. 39: warning, then deduction, then suspension, then dismissal.
- Summary dismissal only on the Art. 44 grounds, and only after a written investigation in which the employee is heard.
- Dismissal for exercising a legal right is arbitrary (Art. 47) and attracts compensation.

### The due-process file

No termination letter goes out without the file:

| Country | The file contains |
|---|---|
| Pakistan (misconduct) | Show-cause notice, the reply, inquiry minutes, and the reasoned order |
| UAE | Written investigation and the Art. 44 ground, or a notice-based termination with a legitimate reason |

## 5. Grievance

- Any employee may raise a written grievance to HR, or to the Founder if it concerns HR.
- HR acknowledges within **2 working days** and gives an outcome within **10**.
- Harassment complaints go to the Inquiry Committee (Anti-Harassment & Equal Opportunity Policy) and are never handled informally.
- Grievances and outcomes are logged in the incident and grievance log, reported to the Founder quarterly.

## 6. Roles and responsibilities

| Role | Responsibility |
|---|---|
| Reporting Manager | Runs check-ins and appraisals, and documents feedback as it is given. |
| HR Manager | Runs due process, keeps the due-process file and the grievance log, and meets the grievance deadlines. |
| Founder | Approves terminations and hears grievances about HR. |

## 7. Related policies

- Role Scorecard Policy; Salary Review & Increment Policy
- Anti-Harassment & Equal Opportunity Policy; Code of Conduct & Ethics Policy
`,
  },

  {
    title: 'Offboarding & Exit Procedure (SOP-10)',
    code: 'CVT-SOP-10',
    idLabel: 'Procedure ID',
    section: '§2.10 (SOP-10)',
    category: 'GENERAL',
    type: 'HR_POLICY',
    audienceRoles: EVERYONE,
    description:
      'Every exit, step by step: acknowledgment and notice, handover, access removal, asset return, exit interview, final settlement and documents.',
    body: `## 1. Purpose

Every exit — resignation, non-confirmation, end of contract or termination — runs on **Form F-10** and closes only when the clearance is fully signed.

## 2. Scope

Every employee, trainee and intern leaving Convertt or SyeDev LLC FZ, for any reason.

## 3. Procedure

1. **Trigger and acknowledgment.** Resignations are acknowledged in writing within 24 hours, confirming the last working day per the notice rule: 1 month standard, 2 months for Lead and senior client-facing roles; UAE per contract (30 to 90 days). Terminations are executed only with the correct letter, notice or pay in lieu, and — for misconduct — the completed due-process file.
2. **Handover plan (week 1 of notice).** Manager and leaver agree a written handover: client relationships, credentials to transfer (through the password manager, never by chat), open deliverables, and documentation. Client-facing departures are communicated to clients by the Founder, not the leaver.
3. **Access ramp-down.** HR and IT schedule revocation: client systems on the last client-work day; internal systems by the end of the last working day; email forwarded or archived; MFA and shared credentials rotated within 24 hours of exit.
4. **Asset return and clearance.** All F-07 items returned and condition-checked against the issue photos; each department signs its clearance line on F-10.
5. **Exit interview.** HR runs a structured 30-minute conversation (template in F-10); themes are reported to the Founder quarterly.
6. **Final settlement and documents.** Full and final computed on F-10: salary to the last day, leave encashment per the Annex, deductions (lawful, documented, within caps), and — UAE — end-of-service gratuity on basic pay. Pakistan: settle promptly, at the latest with the next payroll. UAE: all entitlements paid within 14 days of the end date (Art. 53). An experience or service certificate is issued in all cases and is never withheld as leverage.

## 4. HR checklist — exit

${CHECKLIST_NOTE}

| Check | What must be verified | Owner | Evidence |
|---|---|---|---|
| Notice and last day correctly computed | Role level checked for the 1- or 2-month rule (Pakistan) or the contract notice (UAE, 30 to 90 days). Garden leave or pay in lieu approved by the Founder in writing. | HR | Acknowledgment letter |
| Termination file complete (if termination) | Pakistan misconduct: show-cause, reply, inquiry minutes, reasoned order. UAE: written investigation and Art. 44 ground, or notice-based termination with a legitimate reason. No letter goes out without this file. | HR and Founder | Due-process file |
| Access revocation log | Every system on the onboarding provisioning list has a revocation timestamp; credentials rotated; client-side access removals confirmed with the client where applicable. | IT | F-10 access log |
| Assets fully recovered | F-07 reconciles to zero open items; damage assessed against the issue photos; any recovery documented and within deduction caps. | HR | F-10 asset section |
| Final settlement verified twice | A second person re-checks the full-and-final arithmetic (salary days, leave encashment, UAE gratuity on basic, deductions). The Founder approves before payment. | HR and Founder | F-10 settlement sheet |
| Surviving obligations re-served | Letter restating confidentiality, IP, non-solicitation (12 months) and non-disparagement, acknowledged by the leaver. | HR | F-10 §6 signed |
| Statutory closure | Pakistan: EOBI exit recorded. UAE: visa cancellation sequenced only after settlement is agreed; free zone notified; insurance ended at cancellation. | HR | Cancellation receipts |
| File archived | Personnel file, clearance and settlement archived per the retention schedule. | HR | Archive index |

## 5. Related policies and forms

- Confidentiality, IP & Data Protection Policy (retention schedule)
- Asset Assignment & Management Procedure (SOP-05); Performance, Discipline & Grievance Procedure (SOP-09)
- Form F-10 Exit, Clearance & Final Settlement
`,
  },

  {
    title: 'Pakistan Employment Terms (Annex PK)',
    code: 'CVT-ANX-PK',
    idLabel: 'Document ID',
    section: 'Part 5, Annex PK',
    category: 'GENERAL',
    type: 'HR_POLICY',
    audienceRoles: EVERYONE,
    appliesTo: 'Employees of Convertt (sole proprietorship), Lahore, Punjab',
    description:
      'Every number that applies in Pakistan: hours, overtime, leave, probation, notice, wages, EOBI, tax, gratuity, and the Punjab Labour Code 2026 duties.',
    body: `## 1. Legal basis — 2026 update

Punjab consolidated its labour statutes into the **Punjab Labour Code 2026** (enacted 10 February 2026; notified May 2026). It carries forward the framework of the former Shops & Establishments Ordinance 1969, Standing Orders Ordinance 1968, Maternity Benefit Ordinance 1958 and related laws, and adds new duties: written appointment letters for every worker (employing without one is an offence), wages by the 7th of the month, overtime at double rate, digital registers for establishments with 10 or more employees, and broader coverage including remote and gig workers.

The figures below reflect the Code and its predecessor quantums. HR verifies each number against the final Code text with counsel at the annual review.

## 2. Terms

| Item | Convertt rule (Pakistan) | Statutory floor or basis |
|---|---|---|
| Working hours | 10:00 to 19:00, Monday to Friday (45 hours including breaks) | Maximum 48 hours a week; spread-over 12 hours a day or less |
| Overtime | Pre-approved in writing only; paid at 2x the ordinary rate | Double rate — Punjab Labour Code 2026 |
| Leave (probation) | 2 paid days a month (casual and sick pool); lapse monthly | Contractual; statutory leave accrues per the Code |
| Leave (confirmed) | 2 paid days a month plus 14 working days of annual leave after 12 months; carry forward up to 14 days; encashment up to 7 days at exit | Annual 14 consecutive days after 12 months; casual 10; sick 8 (prior-law quantums carried into the Code) |
| Public holidays | Punjab-notified festival holidays (about 10 a year), listed each January | Notified festival holidays |
| Maternity leave | 12 weeks paid (6 before and 6 after birth); no dismissal during leave | Maternity Benefit Ordinance 1958 regime, in the Code |
| Paternity leave | 5 working days paid (Convertt benefit) | No provincial statutory paternity leave (the federal 2023 Act applies to ICT only) |
| Probation | 3 months, extendable once; 14 days' notice either side | Maximum 3 months (Standing Orders regime) |
| Notice (confirmed) | 1 month; 2 months for Lead and senior client-facing roles | 1 month's written notice or wages in lieu |
| Misconduct process | Show cause, reply, inquiry, reasoned order | Due process per the Code and natural justice |
| Wages | Paid by the 7th; payslip monthly; deductions 50% of monthly wage or less | Punjab Labour Code 2026 |
| Minimum wage | All salaries well above the floor | PKR 40,000 a month (Punjab FY2025-26; watch the 2026-27 notification) |
| EOBI | All eligible employees registered; employer 5% and employee 1% of the statutory wage base | EOB Act 1976; rates track the federal minimum wage — verify the current EOBI circular monthly |
| Provident fund and gratuity | Not offered (founder decision); EOBI only. Revisit at about 20 headcount | See the legal watch item below |
| Income tax | Withheld monthly per FBR salaried slabs (Finance Act 2026); deposited by the 7th | s.149 Income Tax Ordinance 2001 |
| Registers | Digital attendance, wage and leave registers maintained | Mandatory for 10 or more employees — Labour Code 2026 |
| Harassment | Standing 3-member Inquiry Committee (at least 1 woman); code displayed in English and Urdu | Harassment Act 2010 (as amended 2022); fine PKR 25,000 to 100,000 for non-display |
| Establishment registration | Registered with the Punjab Labour Department; certificate displayed | Registration duty carried into the Code |
| Occupational safety | Safe premises, first-aid kit, fire extinguishers, accident register; incidents reported to the Inspector within 24 hours | Punjab OSH Act 2019 regime (offices included) |

## 3. Legal watch item — gratuity under the Labour Code 2026

Under the former Standing Orders Ordinance, statutory gratuity bound establishments with 20 or more workers, so Convertt (below 20) could lawfully offer EOBI only. The Labour Code 2026 broadens coverage and grants fixed-term workers gratuity after one year of service. Whether it now imposes gratuity on all small establishments must be confirmed with a Pakistani employment lawyer before the next hire's contract is issued. **Until confirmed, contracts stay silent on gratuity (no contractual promise).** This note stays until counsel signs off.

## 4. Related documents

- Leave Administration Procedure (SOP-07); Payroll & Statutory Compliance Procedure (SOP-08)
- Compensation Principles Policy; Anti-Harassment & Equal Opportunity Policy
`,
  },

  {
    title: 'UAE Employment Terms (Annex UAE)',
    code: 'CVT-ANX-UAE',
    idLabel: 'Document ID',
    section: 'Part 5, Annex UAE',
    category: 'GENERAL',
    type: 'HR_POLICY',
    audienceRoles: EVERYONE,
    appliesTo: 'Employees of SyeDev LLC FZ (trading as Convertt), Dubai free zone',
    description:
      'Every number that applies in the UAE: contract type, hours, overtime, leave, probation, notice, termination, gratuity, pay date, insurance and non-compete.',
    body: `## 1. Legal basis

UAE Federal Decree-Law 33/2021 (as amended, most recently by FDL 9/2024) and Cabinet Resolution 1/2022 apply to free zone employees (DIFC and ADGM excepted). Work permits and contract registration run through the free zone authority, not MOHRE. Where free zone administration is lighter than on the mainland (WPS, ILOE), Convertt adopts the mainland discipline as best practice, as noted below.

UAE statutory minimums (leave, gratuity, insurance) can never be contracted below.

## 2. Terms

| Item | Convertt rule (UAE) | Statutory basis |
|---|---|---|
| Contract type | Fixed-term (typically 2 years), renewable; free zone template naming SyeDev LLC FZ; basic salary stated separately from allowances | Art. 8 FDL 33/2021 (no unlimited contracts) |
| Working hours | 10:00 to 19:00, Monday to Friday (8 hours a day); reduced by 2 hours a day in Ramadan | Arts. 17 and 18: 8 hours a day, 48 hours a week |
| Overtime | Pre-approved; +25% of basic hourly; +50% between 22:00 and 04:00; rest-day work: a substitute day or +50% | Arts. 19 to 21 |
| Weekly rest | Saturday and Sunday (contractual; at least 1 rest day statutory) | Art. 21 |
| Annual leave | 30 calendar days a year from year one (2 days a month accrual after 6 months in year one); unused statutory leave encashed at basic on exit | Art. 29 |
| Sick leave | After probation, up to 90 days a year — 15 full pay, 30 half pay, 45 unpaid; certificate and notice within 3 days | Art. 31 |
| Maternity | 60 days (45 full pay and 15 half pay); up to 45 more unpaid for illness; nursing breaks for 6 months | Art. 30 |
| Parental leave | 5 paid days per parent within 6 months of birth | Art. 32 |
| Bereavement and study | 5 days (spouse) and 3 days (close family); 10 days of study leave after 2 years (accredited UAE institution) | Art. 32 |
| Probation | 6 months or less; employer exit: 14 days' written notice; employee: 1 month (moving within the UAE) or 14 days (leaving the UAE) | Art. 9 |
| Notice (confirmed) | 30 days standard; 60 days for Lead and senior client-facing roles (within the statutory 30 to 90 day band); 1 paid day a week for job search during notice | Art. 43 |
| Termination | Only per Arts. 42 to 45; summary dismissal only on Art. 44 grounds after a written investigation; no dismissal for pregnancy or for filing a complaint | Arts. 42 to 45 and 47 |
| Gratuity | 21 days' basic a year (years 1 to 5), 30 days a year after; capped at 2 years' wage; paid within 14 days of the end date; accrued monthly in the ledger | Arts. 51 to 53 |
| Pay date | 1st of the following month, by bank transfer, evidence retained (WPS discipline adopted as best practice; free zone rules followed) | MR 340/2026 (mainland); free zone practice |
| Health insurance | Company-paid for every employee from visa issue; never charged back to the employee | Dubai Law 11/2013 |
| ILOE | Optional for free zone employees; Convertt informs each hire and supports enrolment (AED 5 to 10 a month, employee-paid) — recommended | FDL 13/2022; MOHRE position for free zones |
| Non-compete | Only for roles with client or trade-secret access; 12 months or less, with defined scope and geography (Dubai and UAE, CRO services); void if terminated during probation | Art. 10; Cabinet Resolution 1/2022 Art. 12 |
| Data protection | Employee data handled per PDPL (FDL 45/2021 and its 2024 Executive Regulations); breach assessment within 72 hours | FDL 45/2021 |
| Emiratisation | Not applicable to free zone entities at current headcount; monitored annually | Cabinet policy (mainland quotas only) |

## 3. Compliance calendar (UAE)

| When | What |
|---|---|
| Monthly | Pay by the 1st; payslips; gratuity accrual ledger; insurance roster check |
| Quarterly | NDA and asset audits; visa and permit expiry scan (90-day horizon) |
| Annually | Contract renewals; insurance renewals; leave-balance audit (December); Playbook legal review |
| On event | Permit and visa filings; gratuity payment within 14 days of exit; PDPL breach assessment within 72 hours |

## 4. Related documents

- Leave Administration Procedure (SOP-07); Payroll & Statutory Compliance Procedure (SOP-08)
- Offer & Pre-joining Procedure (SOP-02); Offboarding & Exit Procedure (SOP-10)
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

  const existing = await prisma.policyDocument.findMany({
    where: { title: { in: DOCS.map((d) => d.title) } },
    select: { id: true, title: true },
  })
  const existingByTitle = new Map(existing.map((e) => [e.title, e.id]))
  const toArchive = await prisma.policyDocument.findMany({
    where: { title: { in: Object.keys(SUPERSEDED) }, status: { not: 'ARCHIVED' } },
    select: { id: true, title: true, status: true, _count: { select: { acknowledgments: true } } },
  })

  console.log(`Approver: ${ceo.fullName} (employee ${ceo.id}${ceo.user ? `, user ${ceo.user.id}` : ', no login'})`)
  console.log(`\n${DOCS.length} documents:`)
  for (const d of DOCS) {
    console.log(`  ${existingByTitle.has(d.title) ? 'update' : 'create'}  ${d.code.padEnd(12)} ${d.title}  [${d.audienceRoles.join(',')}]`)
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
      for (const d of DOCS) {
        const data = {
          title: d.title,
          category: d.category,
          type: d.type,
          description: d.description,
          content: header(d) + '\n' + d.body + footer(d),
          version: VERSION,
          effectiveDate: EFFECTIVE,
          audience: 'ALL',
          audienceRoles: JSON.stringify(d.audienceRoles),
          requiresAck: false,
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
        const id = existingByTitle.get(d.title)
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

  console.log(`\nWrote ${DOCS.length} ACTIVE documents and archived ${toArchive.length}.`)
  await prisma.$disconnect()
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}

module.exports = { POLICIES: DOCS, header, footer }

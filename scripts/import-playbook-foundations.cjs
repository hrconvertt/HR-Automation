/**
 * Align the Policies module with the HR Playbook package (CVT-HR-PB-000,
 * 12 August 2026): "1 playbook + 10 forms", the Playbook being "the single
 * policy document".
 *
 *   node scripts/import-playbook-foundations.cjs            # dry run
 *   node scripts/import-playbook-foundations.cjs --apply    # writes
 *
 * 1. Adds the two Playbook parts not yet loaded as documents — Part 1
 *    (Foundations) and Part 6 (Registers, Compliance Calendar & Records
 *    Retention) — in the same layout as import-playbook-policies.cjs and
 *    import-playbook-sops.cjs. With Parts 2–5 already loaded, every part of
 *    the Playbook is then in the system.
 *
 * 2. Archives every policy that is not part of the Playbook: the June 2026
 *    standalone policies still live, and the draft HTML copy of the whole
 *    Playbook. Package Guide step 7: "Retire the old standalone policy files
 *    (keep archived)". Archived, never deleted — HR can read, restore, or
 *    delete them permanently from Policies. Matched on id AND title, so a row
 *    that has been renamed since this list was made is left alone.
 *
 * A full backup of every policy row was written first to
 * Documents\New Policies\Backups\policies-backup-2026-09-15-before-playbook-alignment.json
 */
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

/** Not part of the Playbook — archive. id → the title it must still have. */
const TO_ARCHIVE = {
  cmq6bpqhm000012yddflwregg: 'Allowances Policy',
  cmq6bprdc000112yduikha5xc: 'Annual Profit Share Policy',
  cmq6bpuu6000812ydtb5h08h0: 'Employee Handbook',
  cmq6bpvt7000912ydxkigu7pi: 'Employee Referral Program',
  cmq6bpwki000b12ydqs981tlf: 'Health Insurance Policy',
  cmq6bpwyj000c12yd49ysok2x: 'Internal Job Posting Policy',
  cmq6bpxow000e12ydvtvqkx4m: 'Learning & Development Policy',
  cmq6bpyfc000f12ydabk1olmf: 'Long Service Rewards Policy',
  cmq6bpz6o000h12yd526tgk7h: 'Non-Disclosure Agreement',
  cmq6bq0w5000l12ydim39ei6f: 'Retention Bonus Policy',
  cmq6bq19x000m12yd42kompo8: 'Rewards & Recognition Policy',
  cmqb17ys10001maxz8iwmt8no: 'Show Cause → Increment Eligibility',
  cmqb17y1i0000maxzwjrva0s1: 'Show Cause → Termination Eligibility',
  cmq6bq1nh000n12ydyhcmecvp: 'Travel & Expense Policy',
  cmq6bq20m000o12ydp3ivq2o9: 'Whistleblower Policy',
  // The whole Playbook as one draft, stored as HTML the reader cannot show;
  // Parts 1–6 are now loaded as their own documents.
  cmszssmw0000084iyt8t9wjja: 'HR Playbook (CVT-HR-PB-001)',
}

function header(p) {
  return [
    '| Policy detail | |',
    '|---|---|',
    `| Policy ID | ${p.code} |`,
    '| Policy owner | HR Manager |',
    `| Approved by | ${APPROVER_LABEL} |`,
    `| Version | ${VERSION} |`,
    `| Effective date | ${EFFECTIVE_LABEL} |`,
    `| Applies to | ${APPLIES_TO_ALL} |`,
    `| Source | HR Playbook CVT-HR-PB-001, ${p.section} |`,
    `| Review cycle | ${REVIEW_CYCLE} |`,
    '',
  ].join('\n')
}

function footer() {
  return [
    '',
    '## Revision history',
    '',
    '| Version | Effective | Change | Approved by |',
    '|---|---|---|---|',
    `| ${VERSION} | ${EFFECTIVE_LABEL} | Issued from HR Playbook v1.0. | ${APPROVER_LABEL} |`,
    '',
    '---',
    '',
    'Where this document and the HR Playbook differ, the Playbook prevails. Where either conflicts with the Country Annex or mandatory local law, the Annex and the law prevail for employees in that country.',
  ].join('\n')
}

const DOCS = [
  {
    title: 'HR Playbook Foundations (Part 1)',
    code: 'CVT-POL-100',
    section: 'Part 1 (§1.1–1.5)',
    category: 'GENERAL',
    type: 'HR_POLICY',
    description:
      'What the Playbook is, the two employing entities, who does what, the employment categories, and the founder decisions every other policy is built on.',
    body: `## 1. Purpose of the Playbook

The Playbook is the single operating manual for people operations at Convertt. It consolidates the employment policies, the step-by-step HR procedures, and the due-diligence checks that protect the company and its people at every stage of the employee lifecycle — from the first interview to the final clearance signature. It replaces scattered individual policy documents as the primary reference; where a standalone policy exists, the Playbook states the controlling rule.

Convertt is a conversion-rate-optimisation (CRO) agency operating from Lahore, Pakistan, and hiring in Dubai, United Arab Emirates. Because employment law differs materially between the two countries, the Playbook is a **Global Core** (Parts 1–4), which applies to everyone, plus two **Country Annexes** (Part 5) that carry every number, entitlement and legal reference specific to each location. If anything in the Global Core conflicts with a Country Annex or with mandatory local law, the Annex and the law prevail for employees in that country.

## 2. The employing entities

| Entity | Details |
|---|---|
| Pakistan | Convertt, a sole proprietorship organised under the laws of the Islamic Republic of Pakistan, Office #201, 5th Floor, Mega Tower, Main Gulberg, Lahore, Punjab ("Convertt PK") |
| United Arab Emirates | SyeDev LLC FZ, a free zone limited liability company registered in Dubai, UAE, trading as Convertt ("Convertt UAE") |
| Brand | Both entities operate under the Convertt brand. Every offer letter, NDA and form must name the correct legal entity for the employee's country — the brand name alone is never the contracting party. |

## 3. Who does what

| Role | Responsibility |
|---|---|
| Founder | Approves headcount, offers, salary bands, promotions, terminations, and any exception to the Playbook. Sole signatory for employment contracts and NDAs. |
| HR Manager | Owns every lifecycle procedure end to end: runs the checklists, collects and verifies documents, maintains the registers and personnel files, executes payroll inputs, and certifies each due-diligence checklist by signing and dating it. |
| Reporting Manager | Owns role scorecards, 30/60/90 plans, probation reviews, performance feedback, and handover supervision at exit. |
| Every employee | Reads the Playbook, signs the acknowledgment (Form F-08), and follows the Code of Conduct. |

### Operating rule

No lifecycle event is complete until its checklist is signed. A hire without a signed NDA, an asset without a signed assignment form, or an exit without a completed clearance form is an open risk and must be escalated to the Founder within 24 hours.

## 4. Employment categories

| Category | Definition | Key differences |
|---|---|---|
| Permanent (confirmed) | Passed probation; confirmed in writing. | Full leave entitlement, benefits, and notice periods. |
| Probationer | New hire in the assessment period (Pakistan: 3 months; UAE: up to 6 months). | Reduced leave; shorter notice; work from home not permitted; confirmation is a scorecard decision, not automatic. |
| Trainee / Intern | Fixed-term learning engagement. | Stipend-based; sick leave as needed (interns); no long-term benefits; NDA still mandatory. |
| Contractor / Freelancer | Engaged for defined deliverables, not employment. | Services agreement and contractor NDA; never issued employment forms; no statutory benefits. Misclassification is a legal risk — when in doubt, treat as an employee. |

## 5. Founder decisions embedded in the Playbook

These founder decisions (logged 10–12 August 2026) are applied throughout the Playbook and may only be changed by the Founder in writing.

1. **Retirement benefits (Pakistan):** no provident fund and no contractual gratuity for now. EOBI (statutory) continues for all eligible Pakistan staff. Revisit at about 20 headcount. The Punjab Labour Code 2026 may extend statutory gratuity to smaller establishments; this is under verification with counsel (see Pakistan Employment Terms).
2. **Leave (Pakistan):** 2 paid days per month (casual and sick pool) plus 14 working days of annual leave after 12 months' service.
3. **Dubai hiring:** under the existing free zone entity, SyeDev LLC FZ. UAE statutory minimums (leave, gratuity, insurance) can never be contracted below.
4. **Pay transparency:** salary bands per level are published internally; individual salaries remain private. Employees may always discuss their own pay with HR.
5. **Notice periods (confirmed staff):** two (2) months for Lead and senior client-facing roles; one (1) month for all other roles. UAE contracts state 30–90 days consistent with this rule and the law.
6. **Remote work:** office-first. Work from home is by prior manager approval, case by case, and is not available during probation (limited exceptions for UAE hires pending visa or relocation logistics, approved by the Founder).

## 6. Related documents

- Every Playbook policy, procedure (SOP-01 to SOP-10) and country annex in this library
- Registers, Compliance Calendar & Records Retention (Part 6)
- Form F-08 Policy & Code of Conduct Acknowledgment
`,
  },

  {
    title: 'Registers, Compliance Calendar & Records Retention (Part 6)',
    code: 'CVT-POL-600',
    section: 'Part 6 (§6.1–6.4)',
    category: 'GENERAL',
    type: 'HR_POLICY',
    description:
      'The registers HR keeps, the monthly, quarterly and annual compliance calendar for Pakistan and the UAE, how long each record is kept, and the index of forms.',
    body: `## 1. Purpose

Compliance is kept current, not reconstructed. This document sets out the registers the HR Manager maintains, the dates that drive statutory deposits and audits in each country, how long every kind of record is kept, and the forms each procedure uses.

## 2. Registers the HR Manager maintains

| Register | Contents | Review cadence |
|---|---|---|
| Personnel files | One per employee: contract, NDA, F-03 pack, acknowledgments, reviews, letters | At every lifecycle event |
| NDA register | Every signatory (staff, interns, contractors), version, date, location of original | Quarterly |
| Asset register | Every asset, holder, condition, status; reconciles to signed F-07s | Quarterly and at exit |
| Attendance, wage and leave registers | Digital; statutory in Punjab for establishments with 10 or more staff | Monthly |
| Statutory receipts | Tax PSIDs and EOBI receipts (Pakistan); visa, insurance and gratuity ledger (UAE) | Monthly |
| Training and acknowledgment log | Playbook and policy acknowledgments (F-08), including the version signed | On every policy update |
| Incident and grievance log | Grievances, harassment referrals, security incidents, outcomes | Quarterly to the Founder |

## 3. Compliance calendar

| When | Pakistan | UAE |
|---|---|---|
| Monthly | Pay by the 7th; deposit withheld tax by the 7th (retain PSID); EOBI contribution and receipt; payslips; registers updated | Pay by the 1st; payslips; gratuity accrual ledger; insurance roster check |
| Quarterly | NDA and asset audits; grievance log to the Founder; spot-check registers | The same, plus a visa and permit expiry scan (90-day horizon) |
| Annually | Minimum-wage and EOBI rate check (July, after the budget); holiday list (January); Playbook legal review; harassment-code display check; establishment registration renewal if due | Contract renewals; insurance renewals; leave-balance audit (December); Playbook legal review |
| On event | EOBI joiner and leaver filings; inquiry files; accident report to the Inspector within 24 hours | Permit and visa filings; gratuity payment within 14 days of exit; PDPL breach assessment within 72 hours |

## 4. Document retention

| Records | Keep for |
|---|---|
| Employment contracts, NDAs, settlement agreements | 10 years after exit |
| Payroll, tax, EOBI and statutory receipts | 10 years |
| Personnel file (reviews, letters, acknowledgments) | 5 years after exit |
| Recruitment records of unsuccessful candidates | 1 year, then delete |
| CCTV and access logs | 90 days unless under investigation |
| Exit clearances and asset records | 5 years after exit |

## 5. Forms index

| Code | Form | Used in |
|---|---|---|
| F-01 | Offer & Appointment Letter — Pakistan | SOP-02 |
| F-02 | Offer Letter — UAE (SyeDev LLC FZ) | SOP-02 |
| F-03 | Employee Information & Document Verification Form | SOP-02 and SOP-03 |
| F-04 | Employee NDA & IP Assignment — Pakistan | SOP-06 |
| F-05 | Employee NDA & IP Assignment — UAE | SOP-06 |
| F-06 | Onboarding Checklist & 30/60/90 Plan | SOP-03 |
| F-07 | Asset Assignment & Return Form | SOP-05 |
| F-08 | Policy & Code of Conduct Acknowledgment | SOP-03 |
| F-09 | Probation Review & Confirmation Form | SOP-04 |
| F-10 | Exit, Clearance & Final Settlement Form | SOP-10 |

## 6. Version control

The Playbook is reviewed every 12 months, and immediately upon any relevant change in Pakistani or UAE law. Changes are approved by the Founder, versioned, and re-acknowledged by all staff through Form F-08. Version 1.0 supersedes all standalone policy documents dated 1 June 2026 where they conflict.

## 7. Related documents

- Confidentiality, IP & Data Protection Policy
- Payroll & Statutory Compliance Procedure (SOP-08)
- Pakistan Employment Terms (Annex PK); UAE Employment Terms (Annex UAE)
`,
  },
]

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

  const candidates = await prisma.policyDocument.findMany({
    where: { id: { in: Object.keys(TO_ARCHIVE) } },
    select: { id: true, title: true, status: true, _count: { select: { acknowledgments: true } } },
  })
  const toArchive = []
  const skipped = []
  for (const [id, expectedTitle] of Object.entries(TO_ARCHIVE)) {
    const row = candidates.find((c) => c.id === id)
    if (!row) skipped.push(`${expectedTitle} — not found`)
    else if (row.title !== expectedTitle) skipped.push(`${id} — title is now "${row.title}", expected "${expectedTitle}"`)
    else if (row.status === 'ARCHIVED') skipped.push(`${row.title} — already archived`)
    else toArchive.push(row)
  }

  console.log(`Approver: ${ceo.fullName}`)
  console.log(`\n${DOCS.length} Playbook documents:`)
  for (const d of DOCS) console.log(`  ${existingByTitle.has(d.title) ? 'update' : 'create'}  ${d.code}  ${d.title}`)
  console.log(`\n${toArchive.length} to archive:`)
  for (const t of toArchive) console.log(`  archive  ${t.title}  (${t.status}, ${t._count.acknowledgments} acks)`)
  if (skipped.length) {
    console.log(`\n${skipped.length} skipped:`)
    for (const s of skipped) console.log(`  skip     ${s}`)
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
          content: header(d) + '\n' + d.body + footer(),
          version: VERSION,
          effectiveDate: EFFECTIVE,
          audience: 'ALL',
          audienceRoles: JSON.stringify(EVERYONE),
          requiresAck: false,
          status: 'ACTIVE',
          reviewerIds: [ceo.id],
          approvedAt: now,
          approvedById: ceo.user?.id ?? null,
          activatedAt: now,
          activatedById: hrUser.id,
          publishedAt: now,
          archivedAt: null,
        }
        const id = existingByTitle.get(d.title)
        const saved = id
          ? await tx.policyDocument.update({ where: { id }, data })
          : await tx.policyDocument.create({ data })
        await tx.policyReview.upsert({
          where: { policyId_reviewerId: { policyId: saved.id, reviewerId: ceo.id } },
          create: { policyId: saved.id, reviewerId: ceo.id, status: 'APPROVED', comment: 'Approved by the CEO; recorded by HR', reviewedAt: now },
          update: { status: 'APPROVED', comment: 'Approved by the CEO; recorded by HR', reviewedAt: now },
        })
      }
      if (toArchive.length) {
        await tx.policyDocument.updateMany({
          where: { id: { in: toArchive.map((t) => t.id) }, status: { not: 'ARCHIVED' } },
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

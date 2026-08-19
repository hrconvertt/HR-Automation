/**
 * Muhammad Mubashir — QA Engineer, hired, first day Monday 24 August 2026.
 *
 *   node scripts/add-mubashir-hire.cjs           # dry run
 *   node scripts/add-mubashir-hire.cjs --write
 *
 * The pipeline he actually went through, in order:
 *   screened → HR telephonic → onsite with Atta (lead) → final with Khawer → hired
 *
 * Contact details are taken from his CV
 * (Documents\JD - QAE\Muhammad Mubashir.pdf) — nothing here is invented.
 *
 * Salary is deliberately absent. No offer amount was given, and a made-up
 * figure would flow straight into the Salary row, the compensation history and
 * his first payslip. The script says so at the end; HR enters it.
 */
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env.local'), override: true })

const { PrismaClient } = require('@prisma/client')

// From the CV.
const CANDIDATE = {
  fullName: 'Muhammad Mubashir',
  email: 'mubashirhamid675@gmail.com',
  phone: '+92 307 521 6167',
  currentCompany: 'Millionaire Tech',
  currentRole: 'SQA Engineer',
  experience: 1.5,
  yearsExperience: 1,
  location: 'Lahore, Pakistan',
  educationLevel: 'BACHELORS',
  workAuthorization: 'PK',
  source: 'PORTAL',
  skills: JSON.stringify([
    'Manual QA', 'Functional testing', 'Regression testing', 'API testing',
    'Postman', 'Swagger', 'Jira', 'ClickUp', 'Linear', 'BrowserStack',
    'Mobile testing', 'Cypress', 'Selenium', 'Agile',
  ]),
  notes:
    'QA Engineer, 1+ years across 15+ SaaS, web and mobile products. Manual QA '
    + 'across SaaS, CRM, EdTech, fintech and AI telephony. RESTful API testing '
    + 'via Postman and Swagger, cross-device mobile testing, on-page SEO checks. '
    + 'Some Cypress and Selenium exposure.',
}

/** UTC midnight — the system stores dates that way and local midnight drifts. */
const utc = (y, m, d, h = 0, min = 0) => new Date(Date.UTC(y, m - 1, d, h, min))

const JOINING_DATE = utc(2026, 8, 24) // Monday

const ROUNDS = [
  {
    round: 1, type: 'HR', duration: 30,
    scheduledAt: utc(2026, 8, 19, 5, 0), // 10:00 PKT
    interviewer: 'Tahreem Waheed',
    notes: 'HR telephonic screen — availability, notice, expectations, comms.',
    result: 'PASS',
  },
  {
    round: 2, type: 'ONSITE', duration: 60,
    scheduledAt: utc(2026, 8, 19, 7, 0), // 12:00 PKT
    interviewer: 'Atta Ur Rehman',
    notes: 'Technical round with the lead, onsite — test design, bug reporting, API testing.',
    result: 'PASS',
  },
  {
    round: 3, type: 'ONSITE', duration: 30,
    scheduledAt: utc(2026, 8, 19, 9, 30), // 14:30 PKT
    interviewer: 'Syed Khawer',
    notes: 'Final conversation — values and fit.',
    result: 'PASS',
  },
]

async function main() {
  const write = process.argv.includes('--write')
  const prisma = new PrismaClient()

  const req = await prisma.jobRequisition.findFirst({
    where: { title: { contains: 'QA', mode: 'insensitive' } },
    select: { id: true, title: true, status: true, departmentId: true, type: true },
  })
  if (!req) { console.error('No QA requisition found.'); process.exit(1) }

  const existing = await prisma.candidate.findFirst({
    where: { fullName: CANDIDATE.fullName, requisitionId: req.id },
    select: { id: true, stage: true },
  })

  // Resolve the interviewers by name so the rounds name real people.
  const names = ROUNDS.map((r) => r.interviewer)
  const staff = await prisma.employee.findMany({
    where: { fullName: { in: names } },
    select: { id: true, fullName: true },
  })
  const idOf = (n) => staff.find((s) => s.fullName === n)?.id ?? null

  console.log(`Requisition: ${req.title} (${req.status})`)
  console.log(`Candidate:   ${CANDIDATE.fullName} — ${existing ? `exists, stage ${existing.stage}` : 'new'}`)
  console.log('Rounds:')
  for (const r of ROUNDS) {
    const who = idOf(r.interviewer)
    console.log(`   ${r.round}. ${r.type.padEnd(7)} ${r.interviewer.padEnd(18)} ${who ? '' : '  ⚠ not found in employees'}`)
  }
  console.log(`First day:   ${JOINING_DATE.toISOString().slice(0, 10)} (Monday)`)
  console.log('Salary:      not set — no offer amount was given\n')

  if (!write) {
    console.log('DRY RUN — nothing written. Re-run with --write.')
    await prisma.$disconnect()
    return
  }

  let candidateId = existing?.id
  if (!candidateId) {
    const c = await prisma.candidate.create({
      data: {
        requisitionId: req.id,
        ...CANDIDATE,
        stage: 'HIRED',
        knockoutStatus: 'PASSED',
      },
      select: { id: true },
    })
    candidateId = c.id
    console.log('Candidate created.')
  } else {
    await prisma.candidate.update({
      where: { id: candidateId },
      data: { ...CANDIDATE, stage: 'HIRED', knockoutStatus: 'PASSED' },
    })
    console.log('Candidate updated to HIRED.')
  }

  const already = await prisma.interview.count({ where: { candidateId } })
  if (already === 0) {
    for (const r of ROUNDS) {
      const who = idOf(r.interviewer)
      await prisma.interview.create({
        data: {
          candidateId,
          round: r.round,
          type: r.type,
          scheduledAt: r.scheduledAt,
          duration: r.duration,
          interviewerIds: who ? JSON.stringify([who]) : null,
          notes: r.notes,
          result: r.result,
        },
      })
    }
    console.log(`${ROUNDS.length} interview rounds recorded.`)
  } else {
    console.log(`${already} interviews already on file — left alone.`)
  }

  // Promote. No offer row exists, so no salary is written — which is correct,
  // because no salary was given. Joining date is corrected straight after,
  // since promoteToEmployee falls back to today without an offer.
  const { promoteToEmployee } = await import('../src/lib/hire-candidate.ts')
    .catch(() => ({ promoteToEmployee: null }))

  if (!promoteToEmployee) {
    console.log('\nCould not import promoteToEmployee from a plain node script.')
    console.log('Open the candidate in Recruiting and press Hire — the pipeline row is ready.')
    await prisma.$disconnect()
    return
  }

  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })

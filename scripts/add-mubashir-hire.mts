/**
 * Muhammad Mubashir — QA Engineer, hired, first day Monday 24 August 2026.
 *
 *   npx tsx scripts/add-mubashir-hire.mts           # dry run
 *   npx tsx scripts/add-mubashir-hire.mts --apply
 *
 * The pipeline he actually went through, in order:
 *   screened → HR telephonic → onsite with Atta (lead) → final with Khawer → hired
 *
 * Contact details come from his CV in Documents/JD - QAE. Nothing is invented.
 *
 * Salary is deliberately absent. No offer figure was given, and a guessed one
 * would flow into the Salary row, the compensation history and his first
 * payslip. The script says so at the end; HR enters it.
 *
 * Hiring runs through promoteToEmployee — the same path the Hire button uses —
 * so he gets an employee code, an onboarding checklist and a background
 * verification row exactly as any other hire would.
 */
import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { PrismaClient } from '@prisma/client'
import { promoteToEmployee } from '../src/lib/hire-candidate'

const prisma = new PrismaClient()
const apply = process.argv.includes('--apply')

/** UTC midnight — the system stores dates that way and local midnight drifts. */
const utc = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(Date.UTC(y, m - 1, d, h, min))

const JOINING_DATE = utc(2026, 8, 24) // Monday

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
    'QA Engineer, 1+ years across 15+ SaaS, web and mobile products — CRM, '
    + 'EdTech, fintech and AI telephony. RESTful API testing via Postman and '
    + 'Swagger, cross-device mobile testing, on-page SEO checks. Some Cypress '
    + 'and Selenium exposure.',
}

const ROUNDS = [
  {
    round: 1, type: 'HR', duration: 30, at: utc(2026, 8, 19, 5, 0),
    who: 'Tahreem Waheed',
    notes: 'HR telephonic screen — availability, notice period, expectations, communication.',
  },
  {
    round: 2, type: 'ONSITE', duration: 60, at: utc(2026, 8, 19, 7, 0),
    who: 'Atta Ur Rehman',
    notes: 'Technical round with the lead, onsite — test design, bug reporting, API testing.',
  },
  {
    round: 3, type: 'ONSITE', duration: 30, at: utc(2026, 8, 19, 9, 30),
    who: 'Syed Khawer',
    notes: 'Final conversation — values and fit.',
  },
]

async function main() {
  const req = await prisma.jobRequisition.findFirst({
    where: { title: { contains: 'QA', mode: 'insensitive' } },
    select: { id: true, title: true, status: true, type: true },
  })
  if (!req) throw new Error('No QA requisition found')

  const staff = await prisma.employee.findMany({
    where: { fullName: { in: ROUNDS.map((r) => r.who) } },
    select: { id: true, fullName: true },
  })
  const idOf = (n: string) => staff.find((s) => s.fullName === n)?.id ?? null

  const hr = await prisma.user.findFirst({
    where: { role: 'HR_ADMIN' }, select: { id: true }, orderBy: { createdAt: 'asc' },
  })
  if (!hr) throw new Error('No HR admin user to attribute the hire to')

  console.log(`Requisition : ${req.title} (${req.status})`)
  console.log(`Candidate   : ${CANDIDATE.fullName} · ${CANDIDATE.email}`)
  for (const r of ROUNDS) {
    console.log(`  round ${r.round} ${r.type.padEnd(7)} ${r.who.padEnd(18)}`
      + `${idOf(r.who) ? '' : '  [!] no employee of that name'}`)
  }
  console.log(`First day   : ${JOINING_DATE.toISOString().slice(0, 10)} (Monday)`)
  console.log('Salary      : not set — no offer figure was given\n')

  if (!apply) {
    console.log('DRY RUN — nothing written. Re-run with --apply.')
    return
  }

  let candidate = await prisma.candidate.findFirst({
    where: { fullName: CANDIDATE.fullName, requisitionId: req.id },
  })
  if (candidate) {
    candidate = await prisma.candidate.update({
      where: { id: candidate.id },
      data: { ...CANDIDATE, stage: 'HIRED', knockoutStatus: 'PASSED' },
    })
    console.log('Candidate updated to HIRED')
  } else {
    candidate = await prisma.candidate.create({
      data: { requisitionId: req.id, ...CANDIDATE, stage: 'HIRED', knockoutStatus: 'PASSED' },
    })
    console.log('Candidate created at HIRED')
  }

  if ((await prisma.interview.count({ where: { candidateId: candidate.id } })) === 0) {
    for (const r of ROUNDS) {
      const who = idOf(r.who)
      await prisma.interview.create({
        data: {
          candidateId: candidate.id,
          round: r.round,
          type: r.type,
          scheduledAt: r.at,
          duration: r.duration,
          interviewerIds: who ? JSON.stringify([who]) : null,
          notes: r.notes,
          result: 'PASS',
        },
      })
    }
    console.log(`${ROUNDS.length} interview rounds recorded`)
  } else {
    console.log('Interviews already on file — left alone')
  }

  const result = await promoteToEmployee(candidate.id, hr.id)
  console.log(`Employee ${result.created ? 'created' : 'already existed'}: ${result.employeeId}`)

  // promoteToEmployee falls back to today when there is no offer row, and his
  // first day is Monday. Correct it, and move the probation window with it.
  await prisma.employee.update({
    where: { id: result.employeeId },
    data: { joiningDate: JOINING_DATE },
  })
  const prob = await prisma.probationRecord.findFirst({
    where: { employeeId: result.employeeId }, orderBy: { createdAt: 'desc' },
  })
  if (prob) {
    const end = new Date(JOINING_DATE)
    end.setUTCMonth(end.getUTCMonth() + 3)
    await prisma.probationRecord.update({
      where: { id: prob.id },
      data: { startDate: JOINING_DATE, endDate: end },
    })
    console.log(`Probation window moved to ${JOINING_DATE.toISOString().slice(0, 10)} — ${end.toISOString().slice(0, 10)}`)
  }

  const emp = await prisma.employee.findUnique({
    where: { id: result.employeeId },
    select: { employeeCode: true, designation: true, department: { select: { name: true } } },
  })
  const checks = await prisma.backgroundVerification.count({
    where: { employeeId: result.employeeId },
  })
  const tasks = await prisma.onboardingTask.count({
    where: { checklist: { employeeId: result.employeeId } },
  })

  console.log(`\n  Code              ${emp?.employeeCode}`)
  console.log(`  Designation       ${emp?.designation} · ${emp?.department?.name ?? '—'}`)
  console.log(`  Verification rows ${checks}`)
  console.log(`  Onboarding tasks  ${tasks}`)
  console.log('\nSalary still needs entering — nothing was guessed.')
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())

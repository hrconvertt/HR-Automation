/**
 * QA Engineer hiring request, raised by Atta Ur Rehman.
 *
 * Created as PENDING with a DRAFT_JD rather than already open, so the request
 * actually travels the approval path it is meant to test: manager raises it,
 * HR approves, the JD gets reviewed, then it posts.
 *
 * The JD is Tahreem's own wording. Three placeholders in it were left as
 * questions rather than filled in — on-site vs hybrid, the perks list, and the
 * working hours. Convertt's standard is 10:00 AM to 7:00 PM Monday to Friday at
 * Mega Tower, which is what the employment letters say, so those are noted as
 * the likely answers rather than silently written in as decided.
 *
 * Dry run by default. Pass --apply to write.
 */
require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const JD = `## QA Engineer — Convertt, Lahore

**Job Type:** Full-time
**Location:** Lahore — on-site / hybrid *(to be confirmed)*

### Full Job Description

We are looking for a talented and detail-oriented QA Engineer with 1–1.5 years of
experience to develop and execute manual and automated test scripts for our
applications, ensuring quality at every stage of the development cycle. You will
work closely with our development team to catch issues early, build reliable
regression coverage, and help raise our overall quality bar as we scale.

### Job Responsibilities

- Design, write, and execute manual test cases across web/mobile applications
- Build and maintain automated test scripts using tools such as Selenium, Cypress, or Playwright
- Perform API testing and validate backend responses using Postman or similar tools
- Create, execute, and maintain functional and regression test cases across releases
- Log, track, and verify bug fixes through to closure
- Collaborate with developers during sprint planning and code review to catch issues early
- Conduct smoke and regression testing before each release
- Maintain test documentation, test plans, and QA reports
- Monitor test executions and report defects with clear, actionable detail

### Skills Required

- Solid understanding of manual testing fundamentals (test case design, bug lifecycle, exploratory testing)
- Hands-on experience with at least one automation framework (Selenium, Cypress, or Playwright)
- Basic experience with API testing (Postman or similar)
- Familiarity with Agile/Scrum development workflows
- Experience with version control (Git)
- Familiarity with bug tracking tools (Jira or similar)
- Strong attention to detail and clear bug-reporting skills
- Good communication skills, written and verbal

### Required Qualifications

- Bachelor's degree in Computer Science, Software Engineering, or related field, or equivalent practical experience

### Job Experience

- 1–1.5 years of QA experience in a software development environment

### Other Benefits

- Compensation: PKR 70,000 – 110,000/month (based on experience and automation skillset)
- Growth path toward Senior QA / QA Automation roles
- Collaborative team environment with a focus on continuous learning
- *Additional perks to be confirmed*

### Job Working Hours

*To be confirmed — Convertt's standard is 10:00 AM – 7:00 PM, Monday to Friday.*
`

const REQUIREMENTS = [
  'Manual testing fundamentals — test case design, bug lifecycle, exploratory testing',
  'At least one automation framework: Selenium, Cypress or Playwright',
  'API testing with Postman or similar',
  'Agile/Scrum workflows',
  'Git',
  'Jira or a comparable bug tracker',
  "Bachelor's in Computer Science, Software Engineering or equivalent practical experience",
  '1–1.5 years of QA experience in a software development environment',
].join('\n')

;(async () => {
  const atta = await p.employee.findFirst({
    where: { fullName: 'Atta Ur Rehman' },
    select: { id: true, employeeCode: true, fullName: true, designation: true, departmentId: true },
  })
  if (!atta) { console.log('Atta Ur Rehman not found.'); return }

  const existing = await p.jobRequisition.findFirst({
    where: { title: 'QA Engineer', requestedById: atta.id },
    select: { id: true, status: true },
  })
  if (existing) {
    console.log(`Already raised — ${existing.id} (${existing.status}).`)
    return
  }

  console.log(`Raised by : ${atta.employeeCode} ${atta.fullName} — ${atta.designation}`)
  console.log('Title     : QA Engineer')
  console.log('Type      : FULL_TIME · 1 vacancy')
  console.log('Salary    : PKR 70,000 – 110,000')
  console.log('Status    : PENDING (awaiting HR approval)')
  console.log('JD        : DRAFT_JD, ' + JD.length + ' chars')
  console.log('\nLeft as questions rather than invented:')
  console.log('  · on-site or hybrid')
  console.log('  · the additional perks list')
  console.log('  · working hours (Convertt standard 10-7 Mon-Fri noted as likely)')

  if (!APPLY) { console.log('\nDry run. Re-run with --apply to write.'); return }

  const req = await p.jobRequisition.create({
    data: {
      title: 'QA Engineer',
      departmentId: atta.departmentId,
      type: 'FULL_TIME',
      vacancies: 1,
      description: JD,
      requirements: REQUIREMENTS,
      salaryMin: 70000,
      salaryMax: 110000,
      status: 'PENDING',
      requestedById: atta.id,
      requestReason: 'GROWTH',
      requestNote:
        'Quality is being caught late and by the developers who wrote the code. '
        + 'A dedicated QA gives us regression coverage that survives a release and '
        + 'a second pair of eyes before anything reaches a client.',
      jdContent: JD,
      jdStatus: 'DRAFT_JD',
      jdGeneratedAt: new Date(),
      scoreThreshold: 60,
    },
    select: { id: true },
  })

  console.log(`\nRaised. /dashboard/recruiting — requisition ${req.id}`)
  await p.$disconnect()
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })

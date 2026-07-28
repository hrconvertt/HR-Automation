/**
 * Production seed — runs once after the first Vercel deploy lands.
 *
 *   Creates the HR_ADMIN user (you), seeds the core lookup tables
 *   (departments, leave policies, payroll config), and is idempotent so
 *   re-running is safe.
 *
 * Usage (from your local machine, with DATABASE_URL pointing at prod):
 *
 *   DATABASE_URL="postgres://..." npm run seed:prod
 *
 * After this lands, sign in at https://your-vercel-url/login with:
 *   email:    hr@convertt.co
 *   password: ChangeMe123!     ← reset on first login (mustChangePass=true)
 *
 * Then run scripts/import-master-sheet.js to load the 28 employees, and
 * scripts/import-master-extras.js for policies / positions / probation.
 */
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const p = new PrismaClient()

const HR_ADMIN_EMAIL    = process.env.HR_ADMIN_EMAIL    || 'hr@convertt.co'
const HR_ADMIN_NAME     = process.env.HR_ADMIN_NAME     || 'Head of People & Culture'
const HR_ADMIN_PASSWORD = process.env.HR_ADMIN_PASSWORD || 'ChangeMe123!'

const DEPARTMENTS = [
  { code: 'HR',   name: 'Human Resources' },
  { code: 'BD',   name: 'Business Development' },
  { code: 'UIUX', name: 'UI/UX Design' },
  { code: 'WBS',  name: 'Web - Shopify' },
  { code: 'WBW',  name: 'Web - WordPress' },
  { code: 'MDT',  name: 'Media Team' },
  { code: 'FIN',  name: 'Finance' },
  { code: 'CTO',  name: 'CTO Office' },
  { code: 'ADM',  name: 'Admin' },
  { code: 'MRK',  name: 'Marketing' },
  { code: 'PCD',  name: 'Project Coordinator' },
]

// Pakistani standard:
//   PERMANENT  — full annual allocation up-front (24 annual / 10 sick / 12 casual).
//   PROBATION  — 1 casual + 1 sick per month worked, NO annual leave.
//   INTERNSHIP — 1 casual per month worked, no annual.
//   TRAINING   — 1 casual per month worked, no annual.
// accrualPerMonth drives per-month allocation; daysPerYear is the cap.
const LEAVE_POLICIES = [
  { employeeType: 'PERMANENT',  leaveType: 'CASUAL', daysPerYear: 12, carryForward: false, maxCarryDays: 0 },
  { employeeType: 'PERMANENT',  leaveType: 'SICK',   daysPerYear: 10, carryForward: false, maxCarryDays: 0 },
  { employeeType: 'PERMANENT',  leaveType: 'ANNUAL', daysPerYear: 24, carryForward: true,  maxCarryDays: 5 },
  { employeeType: 'PROBATION',  leaveType: 'CASUAL', daysPerYear: 12, accrualPerMonth: 1, carryForward: false, maxCarryDays: 0 },
  { employeeType: 'PROBATION',  leaveType: 'SICK',   daysPerYear: 12, accrualPerMonth: 1, carryForward: false, maxCarryDays: 0 },
  // No PROBATION ANNUAL row — probationers do not accrue annual leave.
  { employeeType: 'INTERNSHIP', leaveType: 'CASUAL', daysPerYear: 12, accrualPerMonth: 1, carryForward: false, maxCarryDays: 0 },
  { employeeType: 'TRAINING',   leaveType: 'CASUAL', daysPerYear: 12, accrualPerMonth: 1, carryForward: false, maxCarryDays: 0 },
]

const PAYROLL_CONFIG = [
  { key: 'eobiEnabled',           value: 'true'  },
  { key: 'eobiEmployeeRate',      value: '0.01'  }, // 1% of basic
  { key: 'eobiCap',               value: '370'   }, // PKR 370/month (current Pakistan EOBI cap)
  { key: 'taxEnabled',            value: 'true'  },
  { key: 'overtimeMultiplier',    value: '1.5'   },
  { key: 'standardHoursPerDay',   value: '8'     },
  { key: 'otAllowanceTargetHours',value: '48'    },
  { key: 'otAllowanceCapPkr',     value: '10000' },
]

async function main() {
  console.log('▶ Seeding production database…')

  // ─── 1. Departments ──────────────────────────────────────────────
  for (const d of DEPARTMENTS) {
    await p.department.upsert({
      where: { code: d.code },
      update: { name: d.name },
      create: d,
    })
  }
  console.log(`  ✓ ${DEPARTMENTS.length} departments`)

  // ─── 2. Leave policies ───────────────────────────────────────────
  // Clear stale PROBATION/INTERNSHIP/TRAINING rows that no longer match
  // the new Pakistani policy (e.g. PROBATION ANNUAL = 6 days/year).
  await p.leavePolicy.deleteMany({
    where: {
      OR: [
        { employeeType: 'PROBATION', leaveType: 'ANNUAL' },
        { employeeType: 'INTERNSHIP', leaveType: 'ANNUAL' },
        { employeeType: 'TRAINING', leaveType: 'ANNUAL' },
      ],
    },
  }).catch(() => {})

  for (const lp of LEAVE_POLICIES) {
    await p.leavePolicy.upsert({
      where: { employeeType_leaveType: { employeeType: lp.employeeType, leaveType: lp.leaveType } },
      update: {
        daysPerYear: lp.daysPerYear,
        accrualPerMonth: lp.accrualPerMonth ?? null,
        carryForward: lp.carryForward,
        maxCarryDays: lp.maxCarryDays,
      },
      create: lp,
    })
  }
  console.log(`  ✓ ${LEAVE_POLICIES.length} leave policies`)

  // ─── 3. Payroll config ──────────────────────────────────────────
  for (const c of PAYROLL_CONFIG) {
    await p.config.upsert({
      where: { key: c.key },
      update: { value: c.value },
      create: c,
    })
  }
  console.log(`  ✓ ${PAYROLL_CONFIG.length} payroll config rows`)

  // ─── 4. HR Admin user ────────────────────────────────────────────
  const hashed = await bcrypt.hash(HR_ADMIN_PASSWORD, 12)
  const hrDept = await p.department.findUnique({ where: { code: 'HR' } })

  const hrUser = await p.user.upsert({
    where: { email: HR_ADMIN_EMAIL },
    update: {},
    create: {
      email: HR_ADMIN_EMAIL,
      password: hashed,
      role: 'HR_ADMIN',
      mustChangePass: true,
      isActive: true,
      userRoles: { create: { role: 'HR_ADMIN' } },
    },
  })

  // Pair the user with an employee record so they show up in the directory.
  const existingEmp = await p.employee.findUnique({ where: { email: HR_ADMIN_EMAIL } })
  if (!existingEmp) {
    await p.employee.create({
      data: {
        employeeCode: 'CON-HR-001',
        fullName: HR_ADMIN_NAME,
        email: HR_ADMIN_EMAIL,
        designation: 'Head of People & Culture',
        employeeType: 'PERMANENT',
        status: 'ACTIVE',
        joiningDate: new Date(),
        userId: hrUser.id,
        ...(hrDept ? { departmentId: hrDept.id } : {}),
      },
    })
  } else {
    // One-time migration: bring the existing hr@convertt.co employee up
    // to the new "Head of People & Culture" title. Safe to re-run.
    if (existingEmp.designation === 'HR Administrator') {
      await p.employee.update({
        where: { id: existingEmp.id },
        data: { designation: 'Head of People & Culture' },
      })
    }
  }
  console.log(`  ✓ HR admin: ${HR_ADMIN_EMAIL}`)
  console.log(`     password: ${HR_ADMIN_PASSWORD}  (you'll be forced to change on first login)`)

  // ── Email templates — minimal seed; HR edits these via the admin UI ──
  console.log('\n▶ Seeding email templates…')
  const EMAIL_TEMPLATES = [
    {
      key: 'interview_invite',
      subject: 'Interview Invitation – {{role}} at Convertt',
      description: 'Sent when a candidate moves to INTERVIEW stage.',
      variables: 'candidateName, role, interviewDate, meetingLink',
      body: `<p>Hi {{candidateName}},</p>
<p>Thank you for applying for the <b>{{role}}</b> position at Convertt. We were impressed with your profile and would like to invite you to an interview.</p>
<p><b>Date &amp; time:</b> {{interviewDate}}<br><b>Meeting link:</b> {{meetingLink}}</p>
<p>Please confirm your availability by replying to this email.</p>
<p>Best regards,<br>HR Team, Convertt</p>`,
    },
    {
      key: 'offer_letter',
      subject: 'Employment Offer – {{designation}} at Convertt',
      description: 'Sent when an offer is generated.',
      variables: 'candidateName, designation, salary, joiningDate',
      body: `<p>Hi {{candidateName}},</p>
<p>We are pleased to offer you the position of <b>{{designation}}</b> at Convertt.</p>
<ul><li><b>Compensation:</b> {{salary}}</li><li><b>Joining Date:</b> {{joiningDate}}</li></ul>
<p>Please reply to confirm your acceptance.</p>
<p>Best regards,<br>HR Team, Convertt</p>`,
    },
    {
      key: 'rejection_polite',
      subject: 'Application Update – Convertt',
      description: 'Polite rejection email.',
      variables: 'candidateName, role',
      body: `<p>Hi {{candidateName}},</p>
<p>Thank you for your interest in the <b>{{role}}</b> position at Convertt. After careful review, we have decided to move forward with other candidates whose experience more closely matches our current needs.</p>
<p>We genuinely appreciate the time you invested with us and wish you the best in your career.</p>
<p>Warm regards,<br>HR Team, Convertt</p>`,
    },
    {
      key: 'probation_confirm',
      subject: 'Confirmation of Employment – Convertt',
      description: 'Sent when probation is confirmed.',
      variables: 'employeeName, designation, effectiveDate',
      body: `<p>Hi {{employeeName}},</p>
<p><b>Congratulations!</b> Following a successful probation period, we are pleased to confirm your employment with Convertt as a permanent <b>{{designation}}</b>, effective <b>{{effectiveDate}}</b>.</p>
<p>Best regards,<br>HR Team, Convertt</p>`,
    },
    {
      key: 'settling_checkin_reminder',
      subject: 'Day-30 Check-in Reminder – {{employeeName}}',
      description: 'Reminds manager to submit settling check-in.',
      variables: 'employeeName, managerName, dueDate',
      body: `<p>Hi {{managerName}},</p>
<p>It has been ~30 days since <b>{{employeeName}}</b> joined Convertt. Please submit the settling check-in by <b>{{dueDate}}</b> via the Probation Tracker.</p>
<p>Thanks,<br>HR Team</p>`,
    },
  ]
  for (const t of EMAIL_TEMPLATES) {
    await p.emailTemplate.upsert({
      where: { key: t.key },
      create: t,
      update: {}, // do not overwrite HR edits on re-seed
    })
  }
  console.log(`  ✓ Seeded ${EMAIL_TEMPLATES.length} email templates`)

  console.log('\n▶ Done. Next steps:')
  console.log('   1. Open https://your-vercel-url/login')
  console.log(`   2. Sign in with ${HR_ADMIN_EMAIL} / ${HR_ADMIN_PASSWORD}`)
  console.log('   3. Set a real password')
  console.log('   4. Run: npm run import   (loads the 28 employees from the master sheet)')

  await p.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })

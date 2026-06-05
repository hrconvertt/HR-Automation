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
const HR_ADMIN_NAME     = process.env.HR_ADMIN_NAME     || 'HR Admin'
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

const LEAVE_POLICIES = [
  { employeeType: 'PERMANENT',  leaveType: 'CASUAL', daysPerYear: 12, carryForward: false, maxCarryDays: 0 },
  { employeeType: 'PERMANENT',  leaveType: 'SICK',   daysPerYear: 10, carryForward: false, maxCarryDays: 0 },
  { employeeType: 'PERMANENT',  leaveType: 'ANNUAL', daysPerYear: 24, carryForward: true,  maxCarryDays: 5 },
  { employeeType: 'PROBATION',  leaveType: 'CASUAL', daysPerYear: 6,  carryForward: false, maxCarryDays: 0 },
  { employeeType: 'PROBATION',  leaveType: 'SICK',   daysPerYear: 6,  carryForward: false, maxCarryDays: 0 },
  { employeeType: 'PROBATION',  leaveType: 'ANNUAL', daysPerYear: 6,  carryForward: false, maxCarryDays: 0 },
  { employeeType: 'INTERNSHIP', leaveType: 'CASUAL', daysPerYear: 1,  carryForward: false, maxCarryDays: 0 },
  { employeeType: 'INTERNSHIP', leaveType: 'ANNUAL', daysPerYear: 1,  carryForward: false, maxCarryDays: 0 },
  { employeeType: 'TRAINING',   leaveType: 'CASUAL', daysPerYear: 2,  carryForward: false, maxCarryDays: 0 },
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
  for (const lp of LEAVE_POLICIES) {
    await p.leavePolicy.upsert({
      where: { employeeType_leaveType: { employeeType: lp.employeeType, leaveType: lp.leaveType } },
      update: { daysPerYear: lp.daysPerYear, carryForward: lp.carryForward, maxCarryDays: lp.maxCarryDays },
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
        designation: 'HR Administrator',
        employeeType: 'PERMANENT',
        status: 'ACTIVE',
        joiningDate: new Date(),
        userId: hrUser.id,
        ...(hrDept ? { departmentId: hrDept.id } : {}),
      },
    })
  }
  console.log(`  ✓ HR admin: ${HR_ADMIN_EMAIL}`)
  console.log(`     password: ${HR_ADMIN_PASSWORD}  (you'll be forced to change on first login)`)

  console.log('\n▶ Done. Next steps:')
  console.log('   1. Open https://your-vercel-url/login')
  console.log(`   2. Sign in with ${HR_ADMIN_EMAIL} / ${HR_ADMIN_PASSWORD}`)
  console.log('   3. Set a real password')
  console.log('   4. Run: npm run import   (loads the 28 employees from the master sheet)')

  await p.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })

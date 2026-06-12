/**
 * Add CEO + Co-Founder accounts (Syed Asghar + Syed Khawer).
 *
 * Creates Employee + User + UserRole rows for both founders.
 * Multi-role: HR_ADMIN + EXECUTIVE (primary = EXECUTIVE).
 *
 * Idempotent — safe to re-run. HR should update the actual emails after
 * running if these placeholders aren't right, and instruct each founder
 * to change their password on first login (mustChangePass=true).
 *
 *   node scripts/add-founders.js
 */
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

const TEMP_PASSWORD = 'Convertt2026!'

const FOUNDERS = [
  {
    fullName: 'Syed Asghar',
    designation: 'Chief Executive Officer',
    employeeCode: 'CON-CEO-001',
    email: 'ceo@convertt.co',
  },
  {
    fullName: 'Syed Khawer',
    designation: 'Co-Founder & Head of Administration',
    employeeCode: 'CON-EXE-001',
    email: 'khawer@convertt.co',
  },
]

async function ensureExecutiveDept() {
  let dept = await prisma.department.findFirst({
    where: { OR: [{ code: 'EXE' }, { name: 'Executive' }] },
  })
  if (!dept) {
    dept = await prisma.department.create({
      data: { code: 'EXE', name: 'Executive' },
    })
    console.log('  + Created Executive department')
  }
  return dept
}

async function addFounder(founder, departmentId, hashedPassword) {
  console.log(`\n→ ${founder.fullName} (${founder.employeeCode})`)

  // 1. User
  let user = await prisma.user.findUnique({ where: { email: founder.email } })
  if (user) {
    console.log(`  · User exists: ${founder.email}`)
  } else {
    user = await prisma.user.create({
      data: {
        email: founder.email,
        password: hashedPassword,
        role: 'EXECUTIVE',
        mustChangePass: true,
        isActive: true,
      },
    })
    console.log(`  + Created User: ${founder.email} (temp password: ${TEMP_PASSWORD})`)
  }

  // 2. UserRole rows — HR_ADMIN + EXECUTIVE + EMPLOYEE
  for (const role of ['EXECUTIVE', 'HR_ADMIN', 'EMPLOYEE']) {
    await prisma.userRole.upsert({
      where: { userId_role: { userId: user.id, role } },
      update: {},
      create: { userId: user.id, role },
    })
  }
  console.log(`  + Roles: EXECUTIVE, HR_ADMIN, EMPLOYEE`)

  // 3. Employee
  const existing = await prisma.employee.findUnique({
    where: { employeeCode: founder.employeeCode },
  })
  if (existing) {
    console.log(`  · Employee exists: ${founder.employeeCode}`)
    // Make sure it's linked to the User
    if (existing.userId !== user.id) {
      await prisma.employee.update({
        where: { id: existing.id },
        data: { userId: user.id },
      })
      console.log(`  · Linked Employee to User`)
    }
    return
  }

  await prisma.employee.create({
    data: {
      employeeCode: founder.employeeCode,
      fullName: founder.fullName,
      email: founder.email,
      designation: founder.designation,
      departmentId,
      status: 'ACTIVE',
      employeeType: 'PERMANENT',
      reportingManagerId: null,
      joiningDate: new Date('2020-01-01'),
      userId: user.id,
    },
  })
  console.log(`  + Created Employee`)
}

async function main() {
  console.log('=== Adding founders ===')
  const dept = await ensureExecutiveDept()
  const hashedPassword = await bcrypt.hash(TEMP_PASSWORD, 10)

  for (const f of FOUNDERS) {
    await addFounder(f, dept.id, hashedPassword)
  }

  console.log('\n=== Done ===')
  console.log(`Temp password: ${TEMP_PASSWORD}`)
  console.log('Both founders must change password on first login.')
  console.log('Update emails via the Settings UI if the placeholders are wrong.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

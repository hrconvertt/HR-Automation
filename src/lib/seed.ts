import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const DEPARTMENTS = [
  { code: 'BD', name: 'Business Development' },
  { code: 'UIUX', name: 'UI/UX Design' },
  { code: 'WBS', name: 'Web & Software' },
  { code: 'WBW', name: 'Web & WordPress' },
  { code: 'MDT', name: 'Media & Technology' },
  { code: 'FIN', name: 'Finance' },
  { code: 'HR', name: 'Human Resources' },
  { code: 'CTO', name: 'CTO Office' },
]

const POSITIONS = [
  { title: 'Intern', level: 'L1' },
  { title: 'Junior Developer', level: 'L2' },
  { title: 'Developer', level: 'L3' },
  { title: 'Senior Developer', level: 'L4' },
  { title: 'Team Lead', level: 'L5' },
  { title: 'Manager', level: 'L6' },
  { title: 'Director', level: 'L7' },
  { title: 'UI Designer', level: 'L2' },
  { title: 'Senior UI Designer', level: 'L4' },
  { title: 'Business Development Executive', level: 'L3' },
  { title: 'Senior BDE', level: 'L4' },
  { title: 'HR Executive', level: 'L3' },
  { title: 'HR Manager', level: 'L5' },
  { title: 'Finance Officer', level: 'L3' },
  { title: 'Accounts Manager', level: 'L5' },
  { title: 'CTO', level: 'L7' },
  { title: 'WordPress Developer', level: 'L3' },
  { title: 'SEO Specialist', level: 'L3' },
  { title: 'Content Writer', level: 'L2' },
  { title: 'Project Manager', level: 'L5' },
]

// Leave policies: employeeType + leaveType must be unique
const LEAVE_POLICIES = [
  { leaveType: 'ANNUAL', daysPerYear: 18, employeeType: 'PERMANENT', carryForward: true, maxCarryDays: 6 },
  { leaveType: 'SICK', daysPerYear: 10, employeeType: 'PERMANENT', carryForward: false, maxCarryDays: 0 },
  { leaveType: 'CASUAL', daysPerYear: 10, employeeType: 'PERMANENT', carryForward: false, maxCarryDays: 0 },
  { leaveType: 'MATERNITY', daysPerYear: 84, employeeType: 'PERMANENT', carryForward: false, maxCarryDays: 0 },
  { leaveType: 'PATERNITY', daysPerYear: 5, employeeType: 'PERMANENT', carryForward: false, maxCarryDays: 0 },
  { leaveType: 'SICK', daysPerYear: 5, employeeType: 'PROBATION', carryForward: false, maxCarryDays: 0 },
  { leaveType: 'CASUAL', daysPerYear: 3, employeeType: 'PROBATION', carryForward: false, maxCarryDays: 0 },
  { leaveType: 'SICK', daysPerYear: 3, employeeType: 'INTERNSHIP', carryForward: false, maxCarryDays: 0 },
  { leaveType: 'CASUAL', daysPerYear: 2, employeeType: 'INTERNSHIP', carryForward: false, maxCarryDays: 0 },
]

async function main() {
  console.log('Seeding database...')

  // Create departments
  for (const dept of DEPARTMENTS) {
    await prisma.department.upsert({
      where: { code: dept.code },
      update: {},
      create: dept,
    })
  }

  const hrDept = await prisma.department.findUnique({ where: { code: 'HR' } })

  // Create positions
  for (const pos of POSITIONS) {
    const existing = await prisma.position.findFirst({ where: { title: pos.title } })
    if (!existing) {
      await prisma.position.create({ data: pos })
    }
  }

  // Create leave policies
  for (const policy of LEAVE_POLICIES) {
    await prisma.leavePolicy.upsert({
      where: { employeeType_leaveType: { employeeType: policy.employeeType, leaveType: policy.leaveType } },
      update: {},
      create: policy,
    })
  }

  // Create HR Admin user
  const hashedPassword = await bcrypt.hash('Convertt@2026', 12)

  const hrUser = await prisma.user.upsert({
    where: { email: 'hr@convertt.co' },
    update: {},
    create: {
      email: 'hr@convertt.co',
      password: hashedPassword,
      role: 'HR_ADMIN',
      mustChangePass: false,
    },
  })

  // Create HR Employee record
  const existingEmp = await prisma.employee.findUnique({ where: { email: 'hr@convertt.co' } })
  if (!existingEmp) {
    const hrEmployee = await prisma.employee.create({
      data: {
        employeeCode: 'CON-HR-001',
        fullName: 'HR Administrator',
        email: 'hr@convertt.co',
        designation: 'HR Manager',
        departmentId: hrDept?.id ?? null,
        joiningDate: new Date('2024-01-01'),
        employeeType: 'PERMANENT',
        status: 'ACTIVE',
      },
    })

    await prisma.user.update({
      where: { id: hrUser.id },
      data: { employee: { connect: { id: hrEmployee.id } } },
    })

    // Create salary for HR employee
    await prisma.salary.create({
      data: {
        employeeId: hrEmployee.id,
        basic: 80000,
        houseRent: 30000,
        utilities: 5000,
        food: 5000,
        fuel: 10000,
        medicalAllowance: 5000,
        otherAllowance: 0,
        effectiveFrom: new Date('2024-01-01'),
      },
    })

    // Init leave balances for HR employee
    const policies = await prisma.leavePolicy.findMany({ where: { employeeType: 'PERMANENT' } })
    for (const p of policies) {
      await prisma.leaveBalance.upsert({
        where: { employeeId_year_leaveType: { employeeId: hrEmployee.id, year: 2026, leaveType: p.leaveType } },
        update: {},
        create: {
          employeeId: hrEmployee.id,
          year: 2026,
          leaveType: p.leaveType,
          allocated: p.daysPerYear,
          used: 0,
          pending: 0,
          remaining: p.daysPerYear,
        },
      })
    }

    // Create onboarding checklist
    await prisma.onboardingChecklist.upsert({
      where: { employeeId: hrEmployee.id },
      update: {},
      create: {
        employeeId: hrEmployee.id,
        welcomeEmailSent: true,
        firstDayCompleted: true,
        offerLetterIssued: true,
        agreementSigned: true,
        cnicCopied: true,
        bankDetailsCollected: true,
        educationDocsCopied: true,
        experienceLettersCopied: true,
        ndaSigned: true,
        photoTaken: true,
        systemAccessGranted: true,
        equipmentIssued: true,
        introductionDone: true,
        status: 'COMPLETED',
        completedAt: new Date('2024-01-01'),
      },
    })
  }

  // Default config
  await prisma.config.upsert({
    where: { key: 'companyName' },
    update: {},
    create: { key: 'companyName', value: 'Convertt Technologies Pvt Ltd' },
  })

  await prisma.config.upsert({
    where: { key: 'workingDays' },
    update: {},
    create: { key: 'workingDays', value: JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) },
  })

  // Salary bands — each needs a positionId
  const positions = await prisma.position.findMany()
  const bandData = [
    { level: 'L1', minSalary: 15000, maxSalary: 25000 },
    { level: 'L2', minSalary: 35000, maxSalary: 60000 },
    { level: 'L3', minSalary: 60000, maxSalary: 100000 },
    { level: 'L4', minSalary: 100000, maxSalary: 150000 },
    { level: 'L5', minSalary: 150000, maxSalary: 220000 },
    { level: 'L6', minSalary: 220000, maxSalary: 350000 },
    { level: 'L7', minSalary: 350000, maxSalary: 600000 },
  ]

  for (const band of bandData) {
    const pos = positions.find((p) => p.level === band.level)
    if (!pos) continue
    const existing = await prisma.salaryBand.findFirst({ where: { positionId: pos.id } })
    if (!existing) {
      await prisma.salaryBand.create({
        data: {
          positionId: pos.id,
          minSalary: band.minSalary,
          maxSalary: band.maxSalary,
          currency: 'PKR',
          effectiveFrom: new Date('2024-01-01'),
        },
      })
    }
  }

  // Sample announcement
  const hrEmp = await prisma.employee.findUnique({ where: { email: 'hr@convertt.co' } })
  if (hrEmp) {
    const existing = await prisma.announcement.findFirst({ where: { title: 'Welcome to Convertt HR' } })
    if (!existing) {
      await prisma.announcement.create({
        data: {
          title: 'Welcome to Convertt HR',
          content: 'Our new HR management system is now live. Please complete your profile and review company policies.',
          audience: 'ALL',
          isPinned: true,
          publishedAt: new Date(),
          createdById: hrEmp.id,
        },
      })
    }
  }

  console.log('Seed complete!')
  console.log('HR Admin login: hr@convertt.co / Convertt@2026')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

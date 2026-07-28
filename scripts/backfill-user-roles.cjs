/**
 * Backfill UserRole rows for every existing user.
 *  - Every user (with an Employee record) gets EMPLOYEE
 *  - Keeps their current primary role (HR_ADMIN / MANAGER / EXECUTIVE) as an additional role
 *  - Auto-adds MANAGER if they're the reportingManager for anyone
 *  - Auto-adds EXECUTIVE if their designation contains Head/CTO/CEO/VP/Chief
 */
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

const EXEC_TITLE_RX = /\b(head|chief|cto|ceo|cxo|coo|cfo|vp|vice president|founder|president)\b/i

async function main() {
  console.log('🔄 Backfilling UserRole table\n')

  // Wipe existing (this is idempotent)
  await p.userRole.deleteMany({})

  const users = await p.user.findMany({
    include: {
      employee: {
        select: { id: true, fullName: true, designation: true, status: true },
      },
    },
  })

  // Pre-fetch every employee that is a reporting manager
  const managers = await p.employee.findMany({
    where: { directReports: { some: {} } },
    select: { id: true, userId: true, fullName: true },
  })
  const managerUserIds = new Set(managers.map((m) => m.userId).filter(Boolean))

  console.log(`Found ${users.length} users, ${managerUserIds.size} are managers\n`)

  for (const u of users) {
    const roles = new Set([u.role])  // start with current primary role

    // Everyone with an employee record is implicitly EMPLOYEE
    if (u.employee) roles.add('EMPLOYEE')

    // Auto-detect MANAGER
    if (managerUserIds.has(u.id)) roles.add('MANAGER')

    // Auto-detect EXECUTIVE from designation
    if (u.employee && u.employee.designation && EXEC_TITLE_RX.test(u.employee.designation)) {
      roles.add('EXECUTIVE')
    }

    // Insert each role
    for (const role of roles) {
      await p.userRole.create({
        data: { userId: u.id, role },
      })
    }

    const empName = u.employee?.fullName ?? u.email
    const designation = u.employee?.designation ?? '—'
    console.log(`  ${empName.padEnd(28)} | ${designation.padEnd(35)} | roles: [${[...roles].join(', ')}]`)
  }

  // Summary
  const counts = await p.userRole.groupBy({ by: ['role'], _count: true })
  console.log('\n📊 Final counts:')
  counts.forEach((c) => console.log(`   ${c.role.padEnd(11)} : ${c._count}`))

  await p.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })

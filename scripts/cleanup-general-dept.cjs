/**
 * Remove the placeholder "General" / "GEN" department if it has no employees.
 * If it still has employees, list them so HR can reassign manually.
 *
 * Usage:
 *   node scripts/cleanup-general-dept.cjs
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const general = await prisma.department.findFirst({
    where: {
      OR: [
        { code: 'GEN' },
        { code: 'GENERAL' },
        { name: { equals: 'General', mode: 'insensitive' } },
      ],
    },
    include: { employees: { select: { id: true, fullName: true, designation: true, status: true } } },
  })

  if (!general) {
    console.log('No General department found. Nothing to clean.')
    return
  }

  console.log(`Found "${general.name}" (code=${general.code}) with ${general.employees.length} employees.`)

  if (general.employees.length > 0) {
    console.log('Cannot delete - still has employees:')
    for (const e of general.employees) {
      console.log(`  - ${e.fullName} (${e.designation}) [${e.status}]`)
    }
    console.log('Reassign these employees to a real department, then re-run.')
    return
  }

  // Detach any positions tied to it (set departmentId to null on positions)
  await prisma.position.updateMany({
    where: { departmentId: general.id },
    data: { departmentId: null },
  })

  await prisma.department.delete({ where: { id: general.id } })
  console.log('Deleted empty General department.')
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })

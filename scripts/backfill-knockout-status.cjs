/**
 * Backfill candidate.knockoutStatus PENDING → PASSED for existing rows.
 *
 *   Existing candidates were created before the knockout pipeline existed.
 *   They should be treated as PASSED so they keep showing on the kanban.
 *
 *   Usage:
 *     node scripts/backfill-knockout-status.cjs
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

;(async () => {
  const result = await prisma.candidate.updateMany({
    where: { knockoutStatus: 'PENDING' },
    data: { knockoutStatus: 'PASSED' },
  })
  console.log(`Updated ${result.count} candidate(s) from PENDING → PASSED.`)
  await prisma.$disconnect()
})().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})

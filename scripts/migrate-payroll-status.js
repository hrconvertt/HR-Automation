/**
 * One-time migration: normalise old PayrollRun rows to the new 5-stage flow.
 *
 *   Legacy → New
 *     APPROVED / RELEASED / LOCKED / DISBURSED / CLOSED → PAID
 *     CALCULATED / MANAGER_CONFIRMED / FINANCE_REVIEWED → PENDING_HR_FINAL
 *     REJECTED                                          → DRAFT
 *
 * Usage:
 *   node scripts/migrate-payroll-status.js          # dry run
 *   node scripts/migrate-payroll-status.js --apply  # actually write
 */

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const TO_PAID = new Set(['APPROVED', 'RELEASED', 'LOCKED', 'DISBURSED', 'CLOSED'])
const TO_HR_FINAL = new Set(['CALCULATED', 'MANAGER_CONFIRMED', 'FINANCE_REVIEWED'])
const TO_DRAFT = new Set(['REJECTED'])

async function main() {
  const apply = process.argv.includes('--apply')
  const runs = await prisma.payrollRun.findMany({
    select: { id: true, month: true, year: true, status: true },
  })

  const updates = []
  for (const r of runs) {
    let next = null
    if (TO_PAID.has(r.status))      next = 'PAID'
    else if (TO_HR_FINAL.has(r.status)) next = 'PENDING_HR_FINAL'
    else if (TO_DRAFT.has(r.status))    next = 'DRAFT'
    if (next && next !== r.status) {
      updates.push({ id: r.id, month: r.month, year: r.year, from: r.status, to: next })
    }
  }

  console.log(`Found ${updates.length} PayrollRun row(s) to migrate.`)
  for (const u of updates) {
    console.log(`  ${u.month}/${u.year}  ${u.from} → ${u.to}`)
  }

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to write changes.')
    return
  }

  for (const u of updates) {
    await prisma.payrollRun.update({
      where: { id: u.id },
      data: { status: u.to },
    })
  }
  console.log(`\nApplied ${updates.length} updates.`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())

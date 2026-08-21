/**
 * Seed the default Pakistan salary structure into the component library.
 *
 *   node scripts/seed-salary-components.cjs
 *
 * Idempotent — matched on name, so re-running updates defaults rather than
 * duplicating. Every value here is a starting default the admin can change in
 * Settings → Salary Structure; nothing is a hardcoded constant elsewhere.
 */
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env.local'), override: true })
const { PrismaClient } = require('@prisma/client')

// The standard Convertt / Pakistan build: Basic is a share of gross, the
// allowances make up the rest. Percentages are indicative — the admin sets the
// real split on the Salary Structure page.
const DEFAULTS = [
  { name: 'Basic',                type: 'earning', calculationBasis: 'percent_of_gross',  defaultValue: 60, isTaxable: true,  orderIndex: 1 },
  { name: 'House Rent Allowance', type: 'earning', calculationBasis: 'percent_of_basic',  defaultValue: 45, isTaxable: true,  orderIndex: 2 },
  { name: 'Medical Allowance',    type: 'earning', calculationBasis: 'percent_of_basic',  defaultValue: 10, isTaxable: false, orderIndex: 3 },
  { name: 'Conveyance Allowance', type: 'earning', calculationBasis: 'fixed_amount',      defaultValue: 5000, isTaxable: true, orderIndex: 4 },
  { name: 'Utilities Allowance',  type: 'earning', calculationBasis: 'percent_of_basic',  defaultValue: 10, isTaxable: true,  orderIndex: 5 },
]

async function main() {
  const prisma = new PrismaClient()

  for (const c of DEFAULTS) {
    const existing = await prisma.salaryComponent.findFirst({ where: { name: c.name } })
    if (existing) {
      await prisma.salaryComponent.update({ where: { id: existing.id }, data: c })
      console.log(`updated  ${c.name}`)
    } else {
      await prisma.salaryComponent.create({ data: { ...c, isStatutory: false, active: true } })
      console.log(`created  ${c.name}`)
    }
  }

  // The default share of gross that is Basic. Read by the structure page and,
  // later, by employee salary assignment.
  await prisma.config.upsert({
    where: { key: 'salaryStructure:basicPctOfGross' },
    update: {},
    create: { key: 'salaryStructure:basicPctOfGross', value: '60' },
  })
  console.log('\nbasic % of gross default: 60 (editable in Settings)')

  await prisma.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })

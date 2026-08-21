/**
 * Seed FBR salaried income-tax slabs for tax year 2025-26.
 * Amounts are annual PKR. Progressive: tax on a salary that lands in a bracket
 * = fixedAmount + ratePercent% of (income − incomeFrom).
 * Rates are editable in the app afterwards — this is just the starting point.
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const TAX_YEAR = '2025-26'

// FBR 2025-26 salaried slabs.
const SLABS = [
  { incomeFrom: 0,        incomeTo: 600000,  ratePercent: 0,  fixedAmount: 0 },
  { incomeFrom: 600000,   incomeTo: 1200000, ratePercent: 1,  fixedAmount: 0 },
  { incomeFrom: 1200000,  incomeTo: 2200000, ratePercent: 11, fixedAmount: 6000 },
  { incomeFrom: 2200000,  incomeTo: 3200000, ratePercent: 23, fixedAmount: 116000 },
  { incomeFrom: 3200000,  incomeTo: 4100000, ratePercent: 30, fixedAmount: 346000 },
  { incomeFrom: 4100000,  incomeTo: null,    ratePercent: 35, fixedAmount: 616000 },
]

async function main() {
  let n = 0
  for (let i = 0; i < SLABS.length; i++) {
    const s = SLABS[i]
    await prisma.taxSlab.upsert({
      where: { taxYear_incomeFrom: { taxYear: TAX_YEAR, incomeFrom: s.incomeFrom } },
      update: { incomeTo: s.incomeTo, ratePercent: s.ratePercent, fixedAmount: s.fixedAmount, orderIndex: i },
      create: { taxYear: TAX_YEAR, ...s, orderIndex: i },
    })
    n++
  }
  console.log(`Seeded ${n} tax slabs for ${TAX_YEAR}.`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())

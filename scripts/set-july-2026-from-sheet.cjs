/**
 * Set July 2026 payroll from the Increments tab's July column.
 *
 * The IFT/IBFT tab labelled "July 2026" holds JUNE's salaries — Convertt pays a
 * month in arrears. Loading it as July put every June figure into the July run,
 * which is why eight people showed their June net. Each of those eight matches
 * the sheet's own note exactly ("net 78,000 in june - 85,000 in july"), which is
 * what makes the diagnosis certain rather than a guess.
 *
 * The Increments tab's July column is the July payroll and totals 2,257,124.
 *
 * Allocation follows the stated reason, as agreed: travel to fuel, home to
 * house rent, commission to bonus, an increment into base. Everything else
 * splits 98/2 basic/utilities. Net is never derived from the components — the
 * components are derived from net, so the total always lands on the rupee.
 *
 * Run:  node scripts/set-july-2026-from-sheet.cjs [--apply]
 */
require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
})
const APPLY = process.argv.includes('--apply')
const MONTH = 7, YEAR = 2026, DAYS = 31
const UTILITIES_RATE = 0.02

/**
 * July 2026, from the Increments tab.
 *   net    — the July figure
 *   base   — the June figure, where the note states one; the difference is the
 *            extra and goes to `to`
 *   to     — component the difference belongs in
 */
const JULY = [
  ['Atta Ur Rehman',        199000],
  ['Muhammad Ahsan',        100000],
  ['Muhammad Usman Saeed',  125000, 110000, 'fuel',      'travel'],
  ['Momna Waryam Khan',     172500],
  ['Ali Shan',               72000],
  ['Iqra Naveed',           140850, null,   null,        '3% sales commission on the cap'],
  ['Usman Ali',              50000],
  ['Arslan',                 52000, null,   null,        'increment'],
  ['Umar Ameen',             80000],
  ['Muzaffar Jamil',         93000],
  ['Aqib Aslam',            128000, 120000, 'fuel',      'travel allowance'],
  ['Ali Hassan',             85000],
  ['Abdullah Shafiq',       170000],
  ['Tayyab Hussain',         48000],
  ['Altaf Yaseen',          135000, 125000, 'fuel',      'travel'],
  ['Muhammad Rayyan',        50000],
  ['Muhammad Ammar Younas', 100000,  73000, 'houseRent', 'home'],
  ['Sheikh Taha Adnan',      65000],
  ['Tahreem Waheed',        100000],
  ['Muhammad Irfan',         55000],
  ['Jamshed',                50000],
  ['Zuhaa Shafi',            55000],
  ['Laiba Mannan',           36774, null,   null,        'worked 13th-31st July, full month 60,000'],
  ['Umer Afzal',             95000],
]

/** In the app's July run but not on the sheet — must not be paid. */
const REMOVE = ['Muhammad Waqas Fareed']

const money = (n) => Math.round(n).toLocaleString('en-US')

async function main() {
  for (let i = 0; i < 6; i++) {
    try { await prisma.$queryRaw`SELECT 1`; break } catch (e) {
      if (i === 5) throw e
      await new Promise((r) => setTimeout(r, 3000))
    }
  }

  const employees = await prisma.employee.findMany({ select: { id: true, employeeCode: true, fullName: true } })
  const byName = new Map(employees.map((e) => [e.fullName, e]))

  const run = await prisma.payrollRun.findFirst({ where: { month: MONTH, year: YEAR }, select: { id: true } })
  if (!run) { console.error('No July 2026 payroll run.'); process.exit(1) }

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — July 2026 from the sheet\n${'='.repeat(94)}`)
  console.log('NAME                        NET      BASIC    UTILS   EXTRA             REASON')

  let total = 0, missing = []
  for (const [name, net, base, to, reason] of JULY) {
    const emp = byName.get(name)
    if (!emp) { missing.push(name); continue }

    const extra = base && to ? Math.round(net - base) : 0
    const remainder = net - extra
    const utilities = Math.round(remainder * UTILITIES_RATE)
    const basic = remainder - utilities

    if (basic + utilities + extra !== Math.round(net)) {
      console.error(`ABORT — ${name}: ${basic + utilities + extra} != ${net}`)
      process.exit(1)
    }
    total += net

    console.log(
      `  ${name.padEnd(24)}${money(net).padStart(8)} ${money(basic).padStart(9)} ${money(utilities).padStart(7)}  ` +
      `${(extra ? `${to} ${money(extra)}` : '—').padEnd(17)} ${reason ?? ''}`,
    )

    if (APPLY) {
      const data = {
        basic, utilities,
        houseRent: to === 'houseRent' ? extra : 0,
        fuel: to === 'fuel' ? extra : 0,
        bonus: to === 'bonus' ? extra : 0,
        overtimePay: to === 'overtimePay' ? extra : 0,
        grossSalary: net, netSalary: net, transactionAmount: net,
        incomeTax: 0, eobi: 0,
        reference: `Salary July ${YEAR}`,
        payoutNotes: reason ?? null,
      }
      const existing = await prisma.payslip.findFirst({
        where: { payrollRunId: run.id, employeeId: emp.id }, select: { id: true },
      })
      if (existing) await prisma.payslip.update({ where: { id: existing.id }, data })
      else {
        await prisma.payslip.create({
          data: {
            ...data, payrollRunId: run.id, employeeId: emp.id, month: MONTH, year: YEAR,
            workingDays: DAYS, presentDays: DAYS, leaveDays: 0, absentDays: 0,
          },
        })
      }
    }
  }

  console.log(`\n  July total: ${money(total)}   (sheet says 2,257,124 -> ${total === 2257124 ? 'EXACT MATCH' : 'MISMATCH'})`)
  if (missing.length) console.log(`  no employee record: ${missing.join(', ')}`)

  for (const name of REMOVE) {
    const emp = byName.get(name)
    if (!emp) continue
    if (APPLY) {
      const d = await prisma.payslip.deleteMany({ where: { payrollRunId: run.id, employeeId: emp.id } })
      console.log(`  removed ${d.count} July payslip for ${name} (not on the sheet)`)
    } else {
      console.log(`  would remove July payslip for ${name} (not on the sheet)`)
    }
  }

  if (!APPLY) console.log('\nNothing written. Re-run with --apply.')
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error(e.message || e); await prisma.$disconnect(); process.exit(1) })

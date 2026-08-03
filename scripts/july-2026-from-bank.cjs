/**
 * July 2026 payroll, taken from the live Paid_IFT / Paid_IBFT sheets.
 *
 * The bank files are the authoritative NET figures — they are what actually
 * left the account. The Salary Master only ever supplied the breakdown, so the
 * basic / utilities split here is carried forward from each employee's June
 * payslip at the same ratio and scaled to the July net. That is the identical
 * rule used to load Aug 2025 - Jun 2026.
 *
 * Employees are matched on IBAN, not name: "Momna" in the IFT sheet is
 * ambiguous between two records (Momna khan and Momna Waryam Khan) while the
 * account number is not. Name is only a fallback, and every fallback is
 * reported so it can be eyeballed.
 *
 * Outputs a paste-ready block for the Salary Master tab, and with --apply
 * replaces the app's July run (currently DRAFT with app-computed figures) with
 * these real amounts.
 *
 * Run:  node scripts/july-2026-from-bank.cjs [--apply]
 */
require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
})
const APPLY = process.argv.includes('--apply')

const MONTH = 7
const YEAR = 2026
const DAYS_IN_MONTH = 31

/** Transcribed from the July 2026 tab of Paid_IFT FORMAT_Jan_2026_IFT. */
const IFT = [
  ['Atta Ur Rehman',    'PK95FAYS3225475000005754', 199000, ''],
  ['Muhammad Ahsan',    'PK80FAYS3547475000010973', 100000, ''],
  ['Usman Saeed',       'PK05FAYS3547475000010965', 110000, ''],
  ['Momna',             'PK48FAYS3547475000010967', 172500, ''],
  ['Ali Shan',          'PK16FAYS3547475000010961',  72000, ''],
  ['Iqra Naveed',       'PK69FAYS3547475000010977', 199188, 'Asghar adjusts the amount'],
  ['Usman Ali',         'PK86FAYS3547475000010962',  50000, ''],
  ['Arslan',            'PK26FAYS3547475000010975',  45000, ''],
  ['Umar Ameen',        'PK93FAYS3173475000005189',  70000, ''],
  ['Muzaffar Jamil',    'PK45FAYS3547475000011118',  83000, ''],
  ['Aqib Aslam',        'PK04FAYS3325475000004138', 128000, ''],
  ['Ali Hassan',        'PK22FAYS3547475000011144',  78000, ''],
  ['Abdllah Shafiq',    'PK72FAYS3547475000011117', 170000, ''],
  ['Tayyab Hussain',    'PK30FAYS3547475000011679',  48000, ''],
  ['Altaf Yaseen',      'PK95FAYS3547475000011673', 125000, ''],
  ['Muhammad Rayyan',   'PK79FAYS3547475000011670',  50000, ''],
  ['Ammar Yonus',       'PK91FAYS3039301000009887',  73000, ''],
  ['Jamshed',           'PK51FAYS0218101000002772',  45000, ''],
]

/** Transcribed from Paid_IBFT Account Details_Jan 2026, July rows. */
const IBFT = [
  ['Sheikh Taha Adnan', 'PK89MEZN0000300112170277', 'MBL',  65000, ''],
  ['Tahreem Waheed',    'PK56UNIL0109000277702342', 'UNIL', 100000, ''],
  ['Irfan',             'PK19MEZN0002470113438297', 'MBL',  55000, ''],
  ['Laiba Mannan',      'PK44NBPA2045004246418128', 'NBP',  36774, 'worked from 13th till 31st july - net pay 60,000'],
  ['ZUHAA SHAFI',       'PK78MEZN0002010115481921', 'MBL',  55000, ''],
]

/** Sheet spelling -> app name. Fallback only; IBAN wins when it matches. */
const NAME_ALIASES = {
  'usman saeed': 'Muhammad Usman Saeed',
  'abdllah shafiq': 'Abdullah Shafiq',
  'ammar yonus': 'Muhammad Ammar Younas',
  'irfan': 'Muhammad Irfan',
  'zuhaa shafi': 'Zuhaa Shafi',
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()
const ibanKey = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const money = (n) => Math.round(n).toLocaleString('en-US')

async function main() {
  for (let i = 0; i < 6; i++) {
    try { await prisma.$queryRaw`SELECT 1`; break } catch (e) {
      if (i === 5) throw e
      await new Promise((r) => setTimeout(r, 3000))
    }
  }

  const rows = [
    ...IFT.map(([name, iban, amount, note]) => ({ name, iban, bank: 'FBL', amount, note, kind: 'IFT' })),
    ...IBFT.map(([name, iban, bank, amount, note]) => ({ name, iban, bank, amount, note, kind: 'IBFT' })),
  ]

  const employees = await prisma.employee.findMany({
    select: {
      id: true, employeeCode: true, fullName: true, designation: true,
      ibanAccount: true, bankAccount: true, department: { select: { name: true } },
    },
  })

  const byIban = new Map()
  for (const e of employees) {
    for (const v of [e.ibanAccount, e.bankAccount]) {
      const k = ibanKey(v)
      if (k.length > 8) byIban.set(k, e)
    }
  }
  const nameCount = new Map()
  for (const e of employees) nameCount.set(norm(e.fullName), (nameCount.get(norm(e.fullName)) || 0) + 1)
  const byName = new Map()
  for (const e of employees) if (nameCount.get(norm(e.fullName)) === 1) byName.set(norm(e.fullName), e)

  // June payslips give the split to carry forward.
  const juneRun = await prisma.payrollRun.findFirst({ where: { month: 6, year: YEAR }, select: { id: true } })
  const june = juneRun
    ? await prisma.payslip.findMany({
        where: { payrollRunId: juneRun.id },
        select: { employeeId: true, basic: true, houseRent: true, utilities: true, netSalary: true },
      })
    : []
  const juneBy = new Map(june.map((p) => [p.employeeId, p]))

  const out = []
  const unmatched = []
  const viaName = []

  for (const r of rows) {
    let emp = byIban.get(ibanKey(r.iban))
    let how = 'IBAN'
    if (!emp) {
      emp = byName.get(norm(NAME_ALIASES[norm(r.name)] ?? r.name))
      how = 'name'
      if (emp) viaName.push(`${r.name} -> ${emp.fullName}`)
    }
    if (!emp) { unmatched.push(r); continue }

    // Flat 95/5. Every row in the Salary Master splits exactly this way
    // (Aqib 121,600/6,400 on 128,000; Atta 189,050/9,950 on 199,000), and House
    // Rent is unused. Deriving the ratio per-employee from the app's June data
    // instead produced two wrong rows: Zuhaa, whose June record is the one whose
    // components do not sum to its gross, and Laiba, who has no June slip
    // because she joined on the 13th of July.
    const j = juneBy.get(emp.id)
    const utilities = Math.round(r.amount * 0.05)
    const houseRent = 0
    const basic = r.amount - utilities - houseRent

    out.push({
      code: emp.employeeCode, name: emp.fullName,
      designation: emp.designation ?? '', dept: emp.department?.name ?? '',
      basic, houseRent, utilities, net: r.amount,
      kind: r.kind, bank: r.bank, iban: r.iban, note: r.note,
      how, empId: emp.id, isNew: !j,
    })
  }

  out.sort((a, b) => a.name.localeCompare(b.name))

  console.log(`July ${YEAR} from the bank sheets — ${rows.length} payments, ${out.length} matched\n`)
  console.log('CODE           NAME                      TYPE  BASIC      H.RENT   UTILITIES  NET PAID   VIA')
  console.log('-'.repeat(100))
  for (const r of out) {
    console.log(
      r.code.padEnd(15) + r.name.padEnd(26) + r.kind.padEnd(6) +
      money(r.basic).padStart(9) + money(r.houseRent).padStart(9) +
      money(r.utilities).padStart(11) + money(r.net).padStart(11) + '   ' + r.how +
      (r.isNew ? '  (no June slip — 95/5 split)' : ''),
    )
  }
  const total = out.reduce((s, r) => s + r.net, 0)
  console.log('-'.repeat(100))
  console.log(`${out.length} employees   total paid  ${money(total)}`)

  if (viaName.length) {
    console.log(`\nmatched by name because the IBAN was not on file (${viaName.length}):`)
    for (const v of viaName) console.log('  ' + v)
  }
  if (unmatched.length) {
    console.log(`\nNO MATCH (${unmatched.length}) — not included:`)
    for (const u of unmatched) console.log(`  ${u.name.padEnd(22)} ${u.iban}  ${money(u.amount)}`)
  }
  const notes = out.filter((r) => r.note)
  if (notes.length) {
    console.log('\nnotes carried from the bank sheets:')
    for (const n of notes) console.log(`  ${n.name}: ${n.note}`)
  }

  // Paste-ready block for the Salary Master tab.
  console.log(`\n${'='.repeat(100)}\nSALARY MASTER — paste block (tab-separated, column order as in the sheet)\n${'='.repeat(100)}`)
  console.log(['Employee Code', 'Employee Name', 'Designation', 'Department', 'Month', 'Month Key',
    'Days in Month', 'Payable Days', 'Leave Days', 'Half Days', 'WFH Days',
    'Basic', 'House Rent', 'Utilities'].join('\t'))
  for (const r of out) {
    console.log([
      r.code, r.name, r.designation, r.dept, `Jul ${YEAR}`, `${YEAR}-0${MONTH}`,
      DAYS_IN_MONTH, DAYS_IN_MONTH, 0, 0, 0,
      r.basic, r.houseRent, r.utilities,
    ].join('\t'))
  }

  if (!APPLY) {
    console.log('\nNothing written to the app. Re-run with --apply to replace the July run.')
    await prisma.$disconnect()
    return
  }

  const run = await prisma.payrollRun.findFirst({ where: { month: MONTH, year: YEAR }, select: { id: true, status: true } })
  if (!run) { console.log('\nNo July payroll run exists to update.'); await prisma.$disconnect(); return }
  if (run.status === 'PAID') { console.log('\nJuly is already PAID — refusing to overwrite.'); await prisma.$disconnect(); return }

  let updated = 0, created = 0
  for (const r of out) {
    const existing = await prisma.payslip.findFirst({
      where: { payrollRunId: run.id, employeeId: r.empId }, select: { id: true },
    })
    const data = {
      basic: r.basic, houseRent: r.houseRent, utilities: r.utilities,
      grossSalary: r.net, netSalary: r.net, transactionAmount: r.net,
      reference: `Salary July ${YEAR}`,
      payoutNotes: r.note || null,
    }
    if (existing) { await prisma.payslip.update({ where: { id: existing.id }, data }); updated++ }
    else {
      await prisma.payslip.create({
        data: {
          ...data, payrollRunId: run.id, employeeId: r.empId, month: MONTH, year: YEAR,
          // Required on create. Full month for everyone: the bank sheet records
          // what was paid, not attendance, and any proration is already baked
          // into the amount (Laiba's 36,774 for a part-month is the example).
          workingDays: DAYS_IN_MONTH, presentDays: DAYS_IN_MONTH,
          leaveDays: 0, absentDays: 0,
        },
      })
      created++
    }
  }
  // Anyone in the app's July run who was not paid per the bank sheets.
  const stale = await prisma.payslip.findMany({
    where: { payrollRunId: run.id, employeeId: { notIn: out.map((r) => r.empId) } },
    select: { employee: { select: { employeeCode: true, fullName: true } } },
  })
  console.log(`\napplied — ${updated} payslip(s) updated, ${created} created`)
  if (stale.length) {
    console.log(`\nin the app's July run but NOT paid per the bank sheets (${stale.length}) — left untouched, review these:`)
    for (const s of stale) console.log(`  ${(s.employee.employeeCode || '—').padEnd(15)}${s.employee.fullName}`)
  }
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error(e.message || e); await prisma.$disconnect(); process.exit(1) })

/**
 * Payroll import — bank files are the amount, the Salary Master is the split.
 *
 *   Amount  : IFT + IBFT "Transaction Amount" = what actually reached the
 *             employee. This is the Net Pay. It is never recalculated.
 *   Breakdown: the matching row in "Salary Master Oct25-Jun26" supplies Basic /
 *             House Rent / Utilities / Food / Fuel and the deductions. When the
 *             sheet's net differs from what was paid, the earnings are scaled so
 *             the net equals the paid amount. When the sheet has no row (leavers,
 *             Aug/Sep 2025), Convertt's standard 95% basic + 5% utilities split
 *             is used — the same ratio every row in the sheet already follows.
 *
 * Writes: PayrollRun + Payslip per month, Salary (pay components) and
 * CompensationHistory per employee.
 *
 * Run:  node scripts/import-payroll-combined.cjs [--dry]
 */
const XLSX = require('xlsx')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
})

const DRY = process.argv.includes('--dry')

const IBFT_FILE = 'C:/Users/HRConvertt/Downloads/Paid_IBFT Account Details_Jan 2026 (1).xlsx'
const IFT_FILE = 'C:/Users/HRConvertt/Downloads/Paid_IFT FORMAT_Jan_2026_IFT (1).xlsx'
const MASTER_FILE = 'C:/Users/HRConvertt/Downloads/Master Sheet - Convertt_HR.xlsx'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

// month key -> [IFT tab, IBFT tab]
const TABS = {
  '2025-08': ['Aug 2025', '(IBFT)Aug 25'],
  '2025-09': ['Sep 2025', '(IBFT)Sep '],
  '2025-10': ['Oct 2025', '(IBFT)Oct '],
  '2025-11': ['Nov 2025', '(IBFT)Nov '],
  '2025-12': ['Dec 2025', '(IBFT)Dec'],
  '2026-01': ['Jan 2026', '(IBFT)Jan'],
  '2026-02': ['Feb 2026', '(IBFT)Feb'],
  '2026-03': ['March 2026', '(IBFT)March'],
  '2026-04': ['April 2026', '(IBFT)April'],
  '2026-05': ['May 2026', '(IBFT)May'],
  '2026-06': ['June 2026', '(IBFT)June'],
}

const num = (v) => {
  if (v === null || v === undefined || v === '') return 0
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : 0
}
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()
const STOP = new Set(['muhammad', 'mohammad', 'md', 'syed', 'sheikh', 'mr', 'ms'])
const toks = (s) => norm(s).split(' ').filter((t) => t.length > 2 && !STOP.has(t))

/** Misspellings and short forms in the bank files, verified by account number. */
const ALIASES = {
  'abdllah shafiq': 'Abdullah Shafiq',
  'ammar yonus': 'Muhammad Ammar Younas',
  'ammar': 'Muhammad Ammar Younas',
  'muhammad ammar': 'Muhammad Ammar Younas',
  'tahrem waheed': 'Tahreem Waheed',
  'momna': 'Momna Waryam Khan',
  'irfan': 'Muhammad Irfan',
  'zuhaa': 'Zuhaa Shafi',
  'rayyan': 'Muhammad Rayyan',
  'altaf': 'Altaf Yaseen',
  'muzaffar': 'Muzaffar Jamil',
  'taha adnan': 'Sheikh Taha Adnan',
  'usman saeed': 'Muhammad Usman Saeed',
  'waqas fareed': 'Muhammad Waqas Fareed',
  'affan': 'Muhammad Affan Waseem',
  'affan waseem': 'Muhammad Affan Waseem',
  'momin': 'Momin Munir',
  'usama aslam': 'Muhammad Usama Aslam',
  'syeda aelia': 'Syeda Manqbat Aelia',
  'aelia': 'Syeda Manqbat Aelia',
  'salman shahid': 'Muhammad Salman Shahid',
  'tayyaba naeem': 'Taiyba Naeem',
  'hashir': 'Muhammad Hashir Siddiqui',
  'muhammad hashir': 'Muhammad Hashir Siddiqui',
  'farzeen': 'Muhammad Farzeen Khan',
  'khawer': 'Syed Khawer',
  'asghar': 'Syed Asghar',
  'tayyab': 'Tayyab Hussain',
  'zain': 'Zain Rasheed',
}

function readBankTab(wb, tab) {
  const ws = wb.Sheets[tab]
  if (!ws) return []
  const out = []
  for (const r of XLSX.utils.sheet_to_json(ws, { defval: null })) {
    const nameKey = Object.keys(r).find((k) => /beneficiary first name/i.test(k) || k.trim() === '')
    const amtKey = Object.keys(r).find((k) => /^transaction amount$/i.test(k.trim()))
    const noteKey = Object.keys(r).find((k) => /^notes?$/i.test(k.trim()))
    const name = nameKey ? r[nameKey] : null
    const amt = amtKey ? num(r[amtKey]) : 0
    if (!name || !amt) continue
    out.push({ name: String(name).trim(), amount: amt, note: noteKey ? r[noteKey] : null })
  }
  return out
}

async function main() {
  for (let i = 0; i < 6; i++) {
    try { await prisma.$queryRaw`SELECT 1`; break } catch (e) {
      if (i === 5) throw e
      await new Promise((r) => setTimeout(r, 3000))
    }
  }

  // ── 1. what was paid ────────────────────────────────────────────────
  const iftWb = XLSX.readFile(IFT_FILE)
  const ibftWb = XLSX.readFile(IBFT_FILE)
  const paid = new Map() // monthKey -> Map(bankName -> {amount, note})
  for (const [key, [iftTab, ibftTab]] of Object.entries(TABS)) {
    const m = new Map()
    for (const r of [...readBankTab(iftWb, iftTab), ...readBankTab(ibftWb, ibftTab)]) {
      const prev = m.get(r.name)
      m.set(r.name, { amount: (prev?.amount ?? 0) + r.amount, note: r.note ?? prev?.note ?? null })
    }
    paid.set(key, m)
  }

  // ── 2. the breakdown ────────────────────────────────────────────────
  const masterRows = XLSX.utils
    .sheet_to_json(XLSX.readFile(MASTER_FILE).Sheets['Salary Master Oct25-Jun26'], { defval: null })
    .filter((r) => r['Employee Code'])
  const breakdown = new Map() // `${normName}|${monthKey}` -> parts
  for (const r of masterRows) {
    const [y, mo] = String(r['Month Key']).split('-')
    const key = `${y}-${String(Number(mo)).padStart(2, '0')}`
    breakdown.set(`${norm(r['Employee Name'])}|${key}`, {
      basic: num(r['Basic']), houseRent: num(r['House Rent']), utilities: num(r['Utilities']),
      food: num(r['Food Allowance']), fuel: num(r['Fuel Allowance']),
      gross: num(r['Gross Salary']),
      bonus: num(r['OT / Bonus']), arrears: num(r['Arrears']),
      otherAllowance: num(r['Other Allowances']) + num(r['Monthly Allowance']),
      incomeTax: num(r['Income Tax']), eobi: num(r['EOBI']), healthcare: num(r['Health Care']),
      loan: num(r['Loan / Vehicle']), advance: num(r['Advance Deduction']),
      otherDeductions: num(r['Other Deductions']),
      net: num(r['Net Pay']),
      daysInMonth: num(r['Days in Month']), payableDays: num(r['Payable Days']),
      leaveDays: num(r['Leave Days']),
    })
  }

  // ── 3. employees ────────────────────────────────────────────────────
  const employees = await prisma.employee.findMany({
    select: { id: true, employeeCode: true, fullName: true, joiningDate: true },
  })
  const nameCount = new Map()
  for (const e of employees) nameCount.set(norm(e.fullName), (nameCount.get(norm(e.fullName)) || 0) + 1)
  const byName = new Map()
  for (const e of employees) if (nameCount.get(norm(e.fullName)) === 1) byName.set(norm(e.fullName), e)

  function resolve(bankName) {
    const n = norm(bankName)
    if (ALIASES[n]) {
      const hit = byName.get(norm(ALIASES[n]))
      if (hit) return hit
    }
    const exact = byName.get(n)
    if (exact) return exact
    const bt = toks(bankName)
    if (bt.length < 2) return null
    const hits = [...byName.entries()].filter(([mn]) => {
      const mt = toks(mn)
      return bt.every((t) => mt.includes(t))
    })
    return hits.length === 1 ? hits[0][1] : null
  }

  // ── 4. build payslips ───────────────────────────────────────────────
  const unresolved = new Map()
  const perMonth = []
  const compTrack = new Map() // employeeId -> [{key, gross, parts}]

  for (const [key, people] of [...paid.entries()].sort()) {
    const [yStr, mStr] = key.split('-')
    const year = Number(yStr), month = Number(mStr)
    const slips = []

    for (const [bankName, { amount, note }] of people) {
      const emp = resolve(bankName)
      if (!emp) {
        const cur = unresolved.get(bankName) ?? { total: 0, months: [] }
        cur.total += amount; cur.months.push(key)
        unresolved.set(bankName, cur)
        continue
      }
      const b = breakdown.get(`${norm(emp.fullName)}|${key}`)
      const netPaid = Math.round(amount * 100) / 100

      let parts
      let source
      if (b && b.net > 0) {
        // Scale earnings so net == what was actually paid, keeping the sheet's
        // deductions and the ratio between the earning lines intact.
        const earn = b.basic + b.houseRent + b.utilities + b.food + b.fuel
        const factor = earn > 0 ? (netPaid + (b.net - b.gross ? 0 : 0) + 0) / earn : 1
        const f = earn > 0 ? (netPaid + b.incomeTax + b.eobi + b.healthcare + b.loan + b.advance + b.otherDeductions - b.bonus - b.arrears - b.otherAllowance) / earn : 1
        const scale = Number.isFinite(f) && f > 0 ? f : 1
        parts = {
          basic: Math.round(b.basic * scale), houseRent: Math.round(b.houseRent * scale),
          utilities: Math.round(b.utilities * scale), food: Math.round(b.food * scale),
          fuel: Math.round(b.fuel * scale),
          bonus: b.bonus, arrears: b.arrears, otherAllowance: b.otherAllowance,
          incomeTax: b.incomeTax, eobi: b.eobi, healthcare: b.healthcare,
          loan: b.loan, advance: b.advance, otherDeductions: b.otherDeductions,
          daysInMonth: b.daysInMonth, payableDays: b.payableDays, leaveDays: b.leaveDays,
        }
        source = Math.abs(scale - 1) < 0.0001
          ? 'Paid amount from bank file; breakdown from Salary Master'
          : 'Paid amount from bank file; Salary Master breakdown scaled to the paid net'
      } else {
        // No sheet row — Convertt's standard split, which every sheet row follows.
        parts = {
          basic: Math.round(netPaid * 0.95), houseRent: 0,
          utilities: netPaid - Math.round(netPaid * 0.95), food: 0, fuel: 0,
          bonus: 0, arrears: 0, otherAllowance: 0,
          incomeTax: 0, eobi: 0, healthcare: 0, loan: 0, advance: 0, otherDeductions: 0,
          daysInMonth: new Date(year, month, 0).getDate(), payableDays: 0, leaveDays: 0,
        }
        source = 'Paid amount from bank file; standard 95/5 split (no Salary Master row)'
      }

      const grossSalary = parts.basic + parts.houseRent + parts.utilities + parts.food + parts.fuel
      slips.push({
        employeeId: emp.id, month, year,
        basic: parts.basic, houseRent: parts.houseRent, utilities: parts.utilities,
        food: parts.food, fuel: parts.fuel, medicalAllowance: 0,
        otherAllowance: parts.otherAllowance, bonus: parts.bonus, overtimePay: 0,
        arrears: parts.arrears, leaveEncashment: 0,
        grossSalary,
        eobi: parts.eobi, incomeTax: parts.incomeTax, healthcare: parts.healthcare,
        providentFund: 0, loanDeduction: parts.loan, advanceDeduction: parts.advance,
        otherDeductions: parts.otherDeductions, lateDeduction: 0,
        netSalary: netPaid,
        transactionAmount: netPaid,
        reference: `Salary ${MONTHS[month - 1]} ${year}`,
        payoutNotes: note ? String(note).slice(0, 400) : null,
        workingDays: Math.round(parts.daysInMonth) || new Date(year, month, 0).getDate(),
        presentDays: Math.round(parts.payableDays) || Math.round(parts.daysInMonth) || 0,
        leaveDays: Math.round(parts.leaveDays) || 0,
        absentDays: 0,
        status: 'PAID',
        isAdjusted: true,
        adjustmentNote: source,
      })

      if (!compTrack.has(emp.id)) compTrack.set(emp.id, [])
      compTrack.get(emp.id).push({ key, year, month, gross: grossSalary, parts })
    }

    perMonth.push({ key, year, month, slips })
  }

  // ── 5. write ────────────────────────────────────────────────────────
  console.log(`${DRY ? 'DRY RUN' : 'APPLYING'} — bank amount + Salary Master breakdown\n${'='.repeat(66)}`)
  console.log('period   slips        net total   run')

  for (const { key, year, month, slips } of perMonth) {
    const total = slips.reduce((s, p) => s + p.netSalary, 0)
    if (!DRY) {
      let run = await prisma.payrollRun.findFirst({ where: { month, year, runType: 'REGULAR' }, select: { id: true } })
      if (!run) {
        run = await prisma.payrollRun.create({
          data: {
            month, year, runType: 'REGULAR', status: 'PAID',
            totalGross: 0, totalNet: 0, totalEOBI: 0, totalTax: 0,
            calculatedAt: new Date(), financePaidAt: new Date(),
          },
          select: { id: true },
        })
      }
      await prisma.payslip.updateMany({ where: { month, year, payrollRunId: null }, data: { payrollRunId: run.id } })
      const existing = await prisma.payslip.findMany({ where: { month, year }, select: { id: true, employeeId: true } })
      const idByEmp = new Map(existing.map((s) => [s.employeeId, s.id]))
      for (const p of slips) {
        const id = idByEmp.get(p.employeeId)
        if (id) await prisma.payslip.update({ where: { id }, data: { ...p, payrollRunId: run.id } })
        else await prisma.payslip.create({ data: { ...p, payrollRunId: run.id } })
      }
      const agg = await prisma.payslip.aggregate({
        where: { payrollRunId: run.id },
        _sum: { grossSalary: true, netSalary: true, eobi: true, incomeTax: true },
      })
      await prisma.payrollRun.update({
        where: { id: run.id },
        data: {
          status: 'PAID',
          totalGross: agg._sum.grossSalary ?? 0, totalNet: agg._sum.netSalary ?? 0,
          totalEOBI: agg._sum.eobi ?? 0, totalTax: agg._sum.incomeTax ?? 0,
        },
      })
    }
    console.log(`${key}  ${String(slips.length).padStart(3)}  ${Math.round(total).toLocaleString().padStart(14)}   ${DRY ? 'would write' : 'PAID'}`)
  }

  // ── 6. pay components + compensation history ────────────────────────
  let salaryWrites = 0, compWrites = 0
  for (const [employeeId, months] of compTrack) {
    months.sort((a, b) => a.key.localeCompare(b.key))
    const latest = months[months.length - 1]
    if (!DRY) {
      await prisma.salary.upsert({
        where: { employeeId },
        update: {
          basic: latest.parts.basic, houseRent: latest.parts.houseRent,
          utilities: latest.parts.utilities, food: latest.parts.food, fuel: latest.parts.fuel,
          medicalAllowance: 0, otherAllowance: latest.parts.otherAllowance,
          effectiveFrom: new Date(Date.UTC(latest.year, latest.month - 1, 1)),
        },
        create: {
          employeeId,
          basic: latest.parts.basic, houseRent: latest.parts.houseRent,
          utilities: latest.parts.utilities, food: latest.parts.food, fuel: latest.parts.fuel,
          medicalAllowance: 0, otherAllowance: latest.parts.otherAllowance,
          effectiveFrom: new Date(Date.UTC(latest.year, latest.month - 1, 1)),
        },
      })
    }
    salaryWrites++

    // one history row per change in gross, plus the opening figure
    const existing = DRY ? [] : await prisma.compensationHistory.findMany({
      where: { employeeId }, select: { effectiveDate: true, newSalary: true },
    })
    const seen = new Set(existing.map((e) => `${e.effectiveDate.toISOString().slice(0, 10)}|${Math.round(e.newSalary)}`))
    let prev = null
    for (const m of months) {
      const eff = new Date(Date.UTC(m.year, m.month - 1, 1))
      const stamp = `${eff.toISOString().slice(0, 10)}|${Math.round(m.gross)}`
      const isFirst = prev === null
      const changed = !isFirst && Math.round(m.gross) !== Math.round(prev.gross)
      if (!isFirst && !changed) { prev = m; continue }
      if (!seen.has(stamp)) {
        if (!DRY) {
          await prisma.compensationHistory.create({
            data: {
              employeeId,
              type: isFirst ? 'ADJUSTMENT' : (m.gross > prev.gross ? 'INCREMENT' : 'ADJUSTMENT'),
              oldSalary: isFirst ? m.gross : prev.gross,
              newSalary: m.gross,
              incrementPct: isFirst || prev.gross === 0 ? 0
                : Math.round(((m.gross - prev.gross) / prev.gross) * 1000) / 10,
              effectiveDate: eff,
              reason: isFirst ? `Opening salary — ${MONTHS[m.month - 1]} ${m.year}`
                : `${MONTHS[m.month - 1]} ${m.year}`,
              notes: 'From IFT/IBFT paid amount + Salary Master breakdown',
            },
          })
        }
        compWrites++
      }
      prev = m
    }
  }

  console.log(`\npay components written : ${salaryWrites}`)
  console.log(`compensation history   : ${compWrites} rows`)

  if (unresolved.size) {
    console.log(`\nbank rows with no matching employee (${unresolved.size}) — not imported:`)
    for (const [n, e] of [...unresolved.entries()].sort((a, b) => b[1].total - a[1].total)) {
      console.log(`  ${n.padEnd(30)} ${String(Math.round(e.total)).padStart(9)}  ${e.months.join(' ')}`)
    }
  }
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })

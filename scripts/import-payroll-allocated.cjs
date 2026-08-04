/**
 * Import payroll with the component split justified by a stated reason.
 *
 * Rules, confirmed with HR:
 *
 *   - The Salary Master's figure is the NET actually paid. The Increments tab
 *     holds the base rate the person was on; the gap between them is an extra
 *     with a reason attached (commission, travel allowance, overtime) or a
 *     genuine rise in base (increment).
 *   - No tax, no EOBI, no statutory deduction of any kind.
 *   - Where the gap has a reason, that exact amount goes into the matching
 *     component — travel to fuel, commission to bonus, overtime to overtime.
 *   - Whatever remains splits 98/2 between basic and utilities. Only 2% sits in
 *     utilities unless a reason says otherwise.
 *
 * Net is never computed from the components — the components are derived FROM
 * the net and the remainder absorbs the rounding, so basic + utilities + extras
 * always equals the paid figure to the rupee. That is checked for every row
 * before anything is written, and the run aborts if any row is off.
 *
 * Run:  node scripts/import-payroll-allocated.cjs [--apply]
 */
require('dotenv').config({ path: '.env.local' })
const XLSX = require('xlsx')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
})
const APPLY = process.argv.includes('--apply')
const FILE = process.env.MASTER_SHEET
  || 'C:/Users/HRConvertt/Downloads/Master Sheet - Convertt_HR.xlsx'
const INCREMENTS = 'Payroll - Increments Performanc'
const SALARY = 'Salary Master Oct25-Jun26'

/** Utilities share when no reason explains the money. */
const UTILITIES_RATE = 0.02

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()
const money = (n) => Math.round(n).toLocaleString('en-US')

const NAME_ALIASES = {
  'usman saeed': 'Muhammad Usman Saeed', 'momna': 'Momna Waryam Khan',
  'usama aslam': 'Muhammad Usama Aslam', 'syeda aelia': 'Syeda Manqbat Aelia',
  'abdllah shafiq': 'Abdullah Shafiq', 'ammar': 'Muhammad Ammar Younas',
  'taha adnan': 'Sheikh Taha Adnan', 'waqas fareed': 'Muhammad Waqas Fareed',
  'tayyaba naeem': 'Taiyba Naeem', 'affan': 'Muhammad Affan Waseem',
  'momin': 'Momin Munir', 'irfan': 'Muhammad Irfan', 'mahnoor': 'Mahnoor Riaz',
  'huzaifa': 'Huzaifa Hakeem', 'zuhaa': 'Zuhaa Shafi',
}
const alias = (n) => (NAME_ALIASES[n] ? norm(NAME_ALIASES[n]) : n)

/**
 * Gaps HR explained directly. These override any note, because the note column
 * was blank for exactly these rows — which is why they showed as unexplained.
 */
const STATED = {
  'iqra naveed|2026-06': 'commission',
  'aqib aslam|2026-06': 'travel',
  'atta ur rehman|2026-06': 'increment',
  'momna waryam khan|2026-06': 'increment',
}

/** A note or stated reason -> which component the extra belongs in. */
function componentFor(text) {
  const t = String(text || '').toLowerCase()
  if (!t) return null
  if (t.includes('commission') || t.includes('comission')) return 'bonus'
  if (t.includes('travel')) return 'fuel'
  if (t.includes('overtime') || t.includes(' ot ')) return 'overtimePay'
  if (t.includes('bonus')) return 'bonus'
  if (t.includes('home') || t.includes('house') || t.includes('rent')) return 'houseRent'
  if (t.includes('arrear') || t.includes('previous month') || t.includes('compensat')) return 'arrears'
  // "increment", "performance", "probation" raise the base itself — no extra.
  return null
}

function serialToMonthKey(v) {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 20000) return null
  const d = new Date(Math.round((n - 25569) * 86400 * 1000))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
function textToMonthKey(v) {
  const s = String(v ?? '').trim()
  if (!s) return null
  let m = s.match(/^(\d{4})-(\d{1,2})$/)
  if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, '0')}`
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  m = s.match(/^([A-Za-z]+)\s+(\d{4})$/)
  if (m) {
    const i = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase())
    if (i !== -1) return `${m[2]}-${String(i + 1).padStart(2, '0')}`
  }
  return null
}
const num = (v) => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) && n !== 0 ? n : null
}

function readSheets() {
  const wb = XLSX.readFile(FILE)

  const incAoa = XLSX.utils.sheet_to_json(wb.Sheets[INCREMENTS], { header: 1, defval: null })
  const hdr = incAoa[3] || []
  const cols = []
  for (let c = 1; c < hdr.length; c++) {
    const key = serialToMonthKey(hdr[c])
    if (key) cols.push({ col: c, key, noteCol: c + 1 })
  }
  const base = new Map()   // "name|month" -> { net, note }
  for (let r = 4; r < incAoa.length; r++) {
    const row = incAoa[r]
    if (!row || !row[0]) continue
    const key = alias(norm(row[0]))
    for (const mc of cols) {
      const net = num(row[mc.col])
      if (!net) continue
      base.set(`${key}|${mc.key}`, {
        net,
        note: String(row[mc.noteCol] ?? '').trim() || null,
      })
    }
  }

  const salAoa = XLSX.utils.sheet_to_json(wb.Sheets[SALARY], { header: 1, defval: null })
  const sh = (salAoa[0] || []).map((h) => String(h ?? '').trim())
  const i = (l) => sh.indexOf(l)
  const rows = []
  for (let r = 1; r < salAoa.length; r++) {
    const row = salAoa[r]
    if (!row || !row[i('Employee Name')]) continue
    const month = textToMonthKey(row[i('Month')])
    if (!month) continue
    const gross = num(row[i('Gross Salary')])
    const net = gross ?? ((num(row[i('Basic')]) ?? 0) + (num(row[i('Utilities')]) ?? 0))
    if (!net) continue
    rows.push({
      name: String(row[i('Employee Name')]).trim(),
      key: alias(norm(row[i('Employee Name')])),
      code: String(row[i('Employee Code')] ?? '').trim(),
      month,
      net,
      leaveDays: num(row[i('Leave Days')]) ?? 0,
      payableDays: num(row[i('Payable Days')]) ?? 0,
    })
  }
  return { base, rows }
}

async function main() {
  for (let i = 0; i < 6; i++) {
    try { await prisma.$queryRaw`SELECT 1`; break } catch (e) {
      if (i === 5) throw e
      await new Promise((r) => setTimeout(r, 3000))
    }
  }

  const { base, rows } = readSheets()
  const employees = await prisma.employee.findMany({ select: { id: true, employeeCode: true, fullName: true } })
  const byName = new Map(employees.map((e) => [alias(norm(e.fullName)), e]))
  const byCode = new Map(employees.map((e) => [String(e.employeeCode ?? '').toUpperCase(), e]))

  const planned = []
  const unmatched = []

  for (const r of rows) {
    const emp = byCode.get(r.code.toUpperCase()) ?? byName.get(r.key)
    if (!emp) { unmatched.push(`${r.code || '—'} ${r.name} ${r.month}`); continue }

    const b = base.get(`${r.key}|${r.month}`)
    const stated = STATED[`${r.key}|${r.month}`]
    const gap = b ? Math.round(r.net - b.net) : 0
    const reasonText = stated ?? b?.note ?? null
    const component = gap > 0 ? componentFor(reasonText) : null

    const extras = {}
    if (component && gap > 0) extras[component] = gap

    const extraTotal = Object.values(extras).reduce((s, v) => s + v, 0)
    const remainder = r.net - extraTotal
    const utilities = Math.round(remainder * UTILITIES_RATE)
    const basic = remainder - utilities

    // The invariant this whole script exists to guarantee.
    const total = basic + utilities + extraTotal
    if (total !== Math.round(r.net)) {
      console.error(`ABORT — ${r.name} ${r.month}: components ${money(total)} != net ${money(r.net)}`)
      process.exit(1)
    }

    planned.push({ emp, ...r, basic, utilities, extras, component, reasonText, gap })
  }

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${planned.length} employee-months\n${'='.repeat(104)}`)
  const withExtra = planned.filter((p) => p.component)
  console.log(`rows where a stated reason carved out an extra (${withExtra.length}):`)
  console.log('  NAME                    MONTH      NET        BASIC    UTILS   EXTRA            REASON')
  for (const p of withExtra) {
    const [k, v] = Object.entries(p.extras)[0]
    console.log(
      `  ${p.name.padEnd(22)}${p.month}  ${money(p.net).padStart(9)}  ${money(p.basic).padStart(9)} ${money(p.utilities).padStart(6)}  ` +
      `${(k + ' ' + money(v)).padEnd(16)} ${String(p.reasonText).slice(0, 30)}`,
    )
  }
  console.log(`\nall other rows: basic ${(100 - UTILITIES_RATE * 100).toFixed(0)}% / utilities ${(UTILITIES_RATE * 100).toFixed(0)}%`)
  console.log(`every row verified: components sum exactly to the paid net`)
  if (unmatched.length) {
    console.log(`\nno matching employee (${unmatched.length}):`)
    for (const u of unmatched.slice(0, 15)) console.log('  ' + u)
  }

  if (!APPLY) { console.log('\nNothing written. Re-run with --apply.'); await prisma.$disconnect(); return }

  let updated = 0, created = 0
  for (const p of planned) {
    const [y, m] = p.month.split('-').map(Number)
    let run = await prisma.payrollRun.findFirst({ where: { month: m, year: y }, select: { id: true, status: true } })
    if (!run) {
      run = await prisma.payrollRun.create({
        data: { month: m, year: y, status: 'PAID', totalGross: 0, totalDeductions: 0, totalNet: 0 },
        select: { id: true, status: true },
      })
    }
    const data = {
      basic: p.basic, houseRent: p.extras.houseRent ?? 0, utilities: p.utilities,
      fuel: p.extras.fuel ?? 0, bonus: p.extras.bonus ?? 0,
      overtimePay: p.extras.overtimePay ?? 0, arrears: p.extras.arrears ?? 0,
      grossSalary: p.net, netSalary: p.net, transactionAmount: p.net,
      incomeTax: 0, eobi: 0,
    }
    const existing = await prisma.payslip.findFirst({
      where: { payrollRunId: run.id, employeeId: p.emp.id }, select: { id: true },
    })
    if (existing) { await prisma.payslip.update({ where: { id: existing.id }, data }); updated++ }
    else {
      await prisma.payslip.create({
        data: {
          ...data, payrollRunId: run.id, employeeId: p.emp.id, month: m, year: y,
          workingDays: p.payableDays || 30, presentDays: p.payableDays || 30,
          leaveDays: p.leaveDays, absentDays: 0,
        },
      })
      created++
    }
  }
  console.log(`\napplied — ${updated} payslips updated, ${created} created`)
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error(e.message || e); await prisma.$disconnect(); process.exit(1) })

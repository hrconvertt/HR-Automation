/**
 * Reconcile "Payroll - Increments Performance" against "Salary Master".
 *
 * The Increments tab is the month-by-month NET each person was put on, with a
 * note explaining any change ("performance", "7500 of overtime", "travel
 * allowance"). The Salary Master is the component breakdown. They must agree on
 * net for every month, and where they don't, one of them is wrong and payroll
 * cannot be closed on it.
 *
 * This only reads and compares — it writes nothing. Run it, read the
 * mismatches, then import.
 *
 * Run:  node scripts/reconcile-payroll-sheets.cjs
 */
const XLSX = require('xlsx')

const FILE = process.env.MASTER_SHEET
  || 'C:/Users/HRConvertt/Downloads/Master Sheet - Convertt_HR.xlsx'
const INCREMENTS = 'Payroll - Increments Performanc'
const SALARY = 'Salary Master Oct25-Jun26'

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()
const money = (n) => Math.round(n).toLocaleString('en-US')

/**
 * The Increments tab uses short names; the Salary Master uses full ones.
 * Without these, 23 of 39 people silently failed to compare — which would have
 * reported agreement that was never actually checked.
 */
const NAME_ALIASES = {
  'usman saeed': 'Muhammad Usman Saeed',
  'momna': 'Momna Waryam Khan',
  'usama aslam': 'Muhammad Usama Aslam',
  'syeda aelia': 'Syeda Manqbat Aelia',
  'abdllah shafiq': 'Abdullah Shafiq',
  'ammar': 'Muhammad Ammar Younas',
  'taha adnan': 'Sheikh Taha Adnan',
  'waqas fareed': 'Muhammad Waqas Fareed',
  'tayyaba naeem': 'Taiyba Naeem',
  'affan': 'Muhammad Affan Waseem',
  'momin': 'Momin Munir',
  'irfan': 'Muhammad Irfan',
  'mahnoor': 'Mahnoor Riaz',
  'huzaifa': 'Huzaifa Hakeem',
  'zuhaa': 'Zuhaa Shafi',
  'jamshed': 'Jamshed',
  'arslan': 'Arslan',
  'islam': 'Islam',
}
const alias = (n) => NAME_ALIASES[n] ? norm(NAME_ALIASES[n]) : n

const norm2 = null


/** Excel serial -> "YYYY-MM". */
function serialToMonthKey(v) {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 20000) return null
  const d = new Date(Math.round((n - 25569) * 86400 * 1000))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** "Jun 2026" / "June 2026" / "2026-06" -> "YYYY-MM". */
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

function main() {
  const wb = XLSX.readFile(FILE)

  // ── Increments: name -> { month -> { net, note } } ────────────────────────
  const incAoa = XLSX.utils.sheet_to_json(wb.Sheets[INCREMENTS], { header: 1, defval: null })
  const hdr = incAoa[3] || []
  const monthCols = []
  for (let c = 1; c < hdr.length; c++) {
    const key = serialToMonthKey(hdr[c])
    // The column immediately after each month is its Notes column.
    if (key) monthCols.push({ col: c, key, noteCol: c + 1 })
  }

  const increments = new Map()
  for (let r = 4; r < incAoa.length; r++) {
    const row = incAoa[r]
    if (!row || !row[0]) continue
    const name = String(row[0]).trim()
    if (!name || /^total/i.test(name)) continue
    const byMonth = {}
    for (const mc of monthCols) {
      const net = num(row[mc.col])
      const note = String(row[mc.noteCol] ?? '').trim() || null
      if (net) byMonth[mc.key] = { net, note }
    }
    if (Object.keys(byMonth).length) increments.set(alias(norm(name)), { name, byMonth })
  }

  // ── Salary Master: name -> { month -> net } ───────────────────────────────
  const salAoa = XLSX.utils.sheet_to_json(wb.Sheets[SALARY], { header: 1, defval: null })
  const sh = (salAoa[0] || []).map((h) => String(h ?? '').trim())
  const idx = (label) => sh.indexOf(label)
  const iName = idx('Employee Name')
  const iMonth = idx('Month')
  const iGross = idx('Gross Salary')
  const iBasic = idx('Basic')
  const iUtil = idx('Utilities')

  const master = new Map()
  for (let r = 1; r < salAoa.length; r++) {
    const row = salAoa[r]
    if (!row || !row[iName]) continue
    const key = textToMonthKey(row[iMonth])
    if (!key) continue
    const gross = num(row[iGross])
    const basic = num(row[iBasic]) ?? 0
    const util = num(row[iUtil]) ?? 0
    const net = gross ?? (basic + util)
    if (!net) continue
    const n = alias(norm(row[iName]))
    if (!master.has(n)) master.set(n, { name: String(row[iName]).trim(), byMonth: {} })
    master.get(n).byMonth[key] = { net, basic, util }
  }

  console.log(`Increments tab : ${increments.size} people, ${monthCols.length} months (${monthCols[0]?.key} … ${monthCols[monthCols.length - 1]?.key})`)
  console.log(`Salary Master  : ${master.size} people\n${'='.repeat(96)}`)

  let agree = 0
  const mismatches = []
  const onlyInc = []
  const onlyMaster = []

  for (const [key, inc] of increments) {
    const m = master.get(key)
    if (!m) { onlyInc.push(inc.name); continue }
    for (const [month, v] of Object.entries(inc.byMonth)) {
      const mv = m.byMonth[month]
      if (!mv) { onlyMaster.push(`${inc.name} ${month}: in Increments (${money(v.net)}) but not in Salary Master`); continue }
      if (Math.abs(mv.net - v.net) < 1) { agree++; continue }
      mismatches.push({
        name: inc.name, month, inc: v.net, master: mv.net,
        diff: mv.net - v.net, note: v.note,
      })
    }
  }

  console.log(`months where NET agrees: ${agree}`)
  if (mismatches.length) {
    console.log(`\nNET DISAGREES (${mismatches.length}) — payroll cannot close on these:`)
    console.log('  NAME                      MONTH     INCREMENTS   SAL MASTER    DIFF      NOTE')
    mismatches.sort((a, b) => a.name.localeCompare(b.name) || a.month.localeCompare(b.month))
    for (const x of mismatches) {
      console.log(
        `  ${x.name.padEnd(24)}  ${x.month}   ${money(x.inc).padStart(10)}   ${money(x.master).padStart(10)}   ${money(x.diff).padStart(8)}   ${x.note ?? ''}`,
      )
    }
  }
  if (onlyInc.length) {
    console.log(`\nin Increments but not in Salary Master (${onlyInc.length}): ${onlyInc.join(', ')}`)
  }
  if (onlyMaster.length) {
    console.log(`\nmonths missing from Salary Master (${onlyMaster.length}):`)
    for (const x of onlyMaster.slice(0, 20)) console.log('  ' + x)
    if (onlyMaster.length > 20) console.log(`  … and ${onlyMaster.length - 20} more`)
  }

  // What the notes actually say, so the allocation rules can be built from
  // the real vocabulary rather than guessed.
  const notes = new Map()
  for (const inc of increments.values()) {
    for (const v of Object.values(inc.byMonth)) {
      if (v.note) notes.set(v.note.toLowerCase(), (notes.get(v.note.toLowerCase()) || 0) + 1)
    }
  }
  console.log(`\ndistinct notes on the Increments tab (${notes.size}):`)
  for (const [n, c] of [...notes.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(c).padStart(3)}x  ${n}`)
  }
}

main()

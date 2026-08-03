/**
 * Import the master sheet's "Probation Tracker" tab into ProbationRecord.
 *
 * The sheet is the source of truth for probation: it holds the review ratings,
 * manager comments, recommended action, post-probation salary and confirmation
 * dates that the app has no other way to know.
 *
 * Matched on employeeCode, which is now safe — the codes were renumbered to the
 * sheet's own scheme, and the tracker uses those same codes (CON-HR-032,
 * CON-UIUX-040). Name is a fallback and every fallback is reported.
 *
 * Records in the app but absent from the sheet are REPORTED, never deleted.
 * Someone being wrongly on probation in the app and someone being missing from
 * the sheet look identical from here, and deleting the review history of the
 * second is not recoverable.
 *
 * Run:  node scripts/import-probation-tracker.cjs [--apply]
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

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()
const str = (v) => { const s = String(v ?? '').trim(); return s && s !== '-' ? s : null }
const num = (v) => { const n = Number(String(v ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0 ? n : null }

/** Excel serial or text date -> Date | null. */
function toDate(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (Number.isFinite(n) && n > 20000) return new Date(Math.round((n - 25569) * 86400 * 1000))
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d
}

/** Sheet's "Recommended Action" -> the app's decision vocabulary. */
function toDecision(action) {
  const a = norm(action)
  if (!a) return null
  if (a.includes('terminate')) return 'TERMINATE'
  if (a.includes('extend')) return 'EXTEND'
  if (a.includes('warn')) return 'WARNING'
  if (a.includes('confirm') || a.includes('permanent')) return 'CONFIRM'
  return null
}

/** Sheet's "Status" -> ProbationRecord.status. */
function toStatus(status, decision) {
  const s = norm(status)
  if (s.includes('confirmed')) return 'CONFIRMED'
  if (s.includes('extended')) return 'EXTENDED'
  if (s.includes('terminated')) return 'TERMINATED'
  if (s.includes('review')) return 'UNDER_REVIEW'
  return decision ? 'UNDER_REVIEW' : 'ACTIVE'
}

async function main() {
  for (let i = 0; i < 6; i++) {
    try { await prisma.$queryRaw`SELECT 1`; break } catch (e) {
      if (i === 5) throw e
      await new Promise((r) => setTimeout(r, 3000))
    }
  }

  const wb = XLSX.readFile(FILE)
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets['Probation Tracker'], { header: 1, defval: null })
  const hdr = (aoa[3] || []).map((h) => String(h ?? '').trim())
  const col = (r, name) => {
    const i = hdr.indexOf(name)
    return i === -1 ? null : r[i]
  }
  const rows = aoa.slice(4).filter((r) => r && (r[0] || r[1]))

  const employees = await prisma.employee.findMany({
    select: { id: true, employeeCode: true, fullName: true },
  })
  const byCode = new Map(employees.map((e) => [String(e.employeeCode ?? '').toUpperCase(), e]))
  const nameCount = new Map()
  for (const e of employees) nameCount.set(norm(e.fullName), (nameCount.get(norm(e.fullName)) || 0) + 1)
  const byName = new Map()
  for (const e of employees) if (nameCount.get(norm(e.fullName)) === 1) byName.set(norm(e.fullName), e)

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${rows.length} rows in the Probation Tracker\n${'='.repeat(96)}`)

  const seen = new Set()
  const unmatched = []
  const anomalies = []
  let written = 0

  for (const r of rows) {
    const code = String(col(r, 'Employee ID') ?? '').trim().toUpperCase()
    const name = str(col(r, 'Full Name'))
    let emp = byCode.get(code)
    let how = 'code'
    if (!emp && name) { emp = byName.get(norm(name)); how = 'name' }
    if (!emp) { unmatched.push(`${code || '—'}  ${name || '—'}`); continue }
    seen.add(emp.id)

    const start = toDate(col(r, 'Probation Start'))
    const end = toDate(col(r, 'Probation End'))
    const joining = toDate(col(r, 'Joining Date'))
    const rating = num(col(r, 'Rating (1-5)'))
    const comments = str(col(r, 'Manager Comments'))
    const action = str(col(r, 'Recommended Action'))
    const salaryAfter = num(col(r, 'Salary After Prob'))
    const confirmDate = toDate(col(r, 'Confirmation Date'))
    const decision = toDecision(action)
    const status = toStatus(col(r, 'Status'), decision)

    if (start && joining && start < joining) {
      anomalies.push(`${emp.employeeCode} ${emp.fullName}: probation starts ${start.toISOString().slice(0, 10)} but joining date is ${joining.toISOString().slice(0, 10)}`)
    }
    if (!start || !end) {
      anomalies.push(`${emp.employeeCode} ${emp.fullName}: missing probation ${!start ? 'start' : 'end'} date — row skipped`)
      continue
    }

    const data = {
      startDate: start,
      endDate: end,
      performanceRating: rating,
      managerNotes: comments,
      managerRecommendation: decision,
      hrDecision: decision,
      salaryBumpAmount: salaryAfter,
      status,
      outcome: status === 'CONFIRMED' ? 'CONFIRMED' : status === 'EXTENDED' ? 'EXTENDED' : status === 'TERMINATED' ? 'TERMINATED' : null,
      outcomeDate: confirmDate,
    }

    console.log(`  ${emp.employeeCode.padEnd(15)}${emp.fullName.padEnd(26)}${String(status).padEnd(14)}rating ${rating ?? '—'}   after-prob ${salaryAfter ? salaryAfter.toLocaleString() : '—'}   ${how === 'name' ? '(matched by name)' : ''}`)
    if (APPLY) {
      await prisma.probationRecord.upsert({
        where: { employeeId: emp.id },
        create: { employeeId: emp.id, ...data },
        update: data,
      })
    }
    written++
  }

  const extras = await prisma.probationRecord.findMany({
    where: { employeeId: { notIn: [...seen] } },
    select: { status: true, employee: { select: { employeeCode: true, fullName: true } } },
  })

  console.log(`\n${'='.repeat(96)}`)
  console.log(`probation records ${APPLY ? 'written' : 'to write'}: ${written}`)
  if (unmatched.length) {
    console.log(`\nno matching employee (${unmatched.length}) — skipped:`)
    for (const u of unmatched) console.log('  ' + u)
  }
  if (anomalies.length) {
    console.log(`\nDATA ANOMALIES in the sheet (${anomalies.length}):`)
    for (const a of anomalies) console.log('  ' + a)
  }
  if (extras.length) {
    console.log(`\nON PROBATION IN THE APP BUT NOT IN THE SHEET (${extras.length}) — left untouched, review these:`)
    for (const e of extras) console.log(`  ${String(e.employee.employeeCode ?? '—').padEnd(15)}${e.employee.fullName.padEnd(26)}${e.status}`)
  }
  if (!APPLY) console.log('\nNothing written. Re-run with --apply.')
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error(e.message || e); await prisma.$disconnect(); process.exit(1) })

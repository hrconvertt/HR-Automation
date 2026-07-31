/**
 * Import the "Terminated - Exit & Asset Track" tab from the Convertt master sheet.
 *
 * Writes:
 *   ExitClearance — one per leaver, carrying the last working day, the exit
 *                   interview date, and the sheet's document checklist.
 *   Employee      — exitDate / status / terminationType, but ONLY where the app
 *                   has no value yet. Existing values are reported as conflicts
 *                   and left alone: status and exitDate gate payroll
 *                   eligibility, so silently overwriting them could change who
 *                   gets paid.
 *
 * The sheet's checklist columns (Termination Letter, Termination Email, NDA,
 * Exit Clearance Form, Experience Letter, Assets Returned) are documents, not
 * the app's departmental IT/Finance/Admin/HR sign-offs, so they are recorded in
 * `settlementNotes` rather than mapped onto those booleans — ticking
 * "financeCleared" off the back of "Experience Letter: Yes" would assert
 * something the sheet never says.
 *
 * Run:  node scripts/import-terminations.cjs [--apply]
 */
const XLSX = require('xlsx')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
})
const APPLY = process.argv.includes('--apply')
const FILE = process.env.MASTER_SHEET
  || 'C:/Users/HRConvertt/Downloads/Master Sheet - Convertt_HR.xlsx'
const TAB = 'Terminated - Exit & Asset Track'

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()
const yes = (v) => /^(yes|y)$/i.test(String(v || '').trim())
const na = (v) => /^n\/?a$/i.test(String(v || '').trim())

/** Excel serial (1900 system) -> Date, or null. */
function xlDate(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < 20000) return null
  return new Date(Math.round((n - 25569) * 86400 * 1000))
}

/** Sheet Status -> app status + terminationType. */
function mapStatus(s) {
  const v = String(s || '').toLowerCase()
  if (v.includes('resign')) return { status: 'RESIGNED', terminationType: 'VOLUNTARY', trigger: 'RESIGNATION' }
  if (v.includes('internship')) return { status: 'TERMINATED', terminationType: 'END_OF_CONTRACT', trigger: 'TERMINATION' }
  if (v.includes('terminat')) return { status: 'TERMINATED', terminationType: 'INVOLUNTARY', trigger: 'TERMINATION' }
  return null
}

const DOC_COLS = [
  'Termination Letter', 'Termination Email', 'Exit Interview Done (Y/N)',
  'NDA - Agreement', 'Exit Clearance Form (Annexure E)', 'Experience Letter', 'Assets Returned',
]

async function main() {
  for (let i = 0; i < 6; i++) {
    try { await prisma.$queryRaw`SELECT 1`; break } catch (e) {
      if (i === 5) throw e
      await new Promise((r) => setTimeout(r, 3000))
    }
  }

  const aoa = XLSX.utils.sheet_to_json(XLSX.readFile(FILE).Sheets[TAB], { header: 1, defval: null })
  const hdr = aoa[0].map((h) => (h === null ? '' : String(h).trim()))
  const rows = aoa.slice(1).filter((r) => r[0] && String(r[0]).trim())
  const col = (r, name) => {
    // Header text in this tab is inconsistently suffixed — match on a prefix.
    let i = hdr.indexOf(name)
    if (i === -1) i = hdr.findIndex((h) => h.toLowerCase().startsWith(name.toLowerCase().slice(0, 14)))
    return i === -1 || r[i] === null ? '' : String(r[i]).trim()
  }

  const employees = await prisma.employee.findMany({
    select: {
      id: true, employeeCode: true, legacyEmployeeCode: true, fullName: true,
      status: true, exitDate: true, terminationType: true,
    },
  })
  const nameCount = new Map()
  for (const e of employees) nameCount.set(norm(e.fullName), (nameCount.get(norm(e.fullName)) || 0) + 1)
  const byName = new Map()
  for (const e of employees) if (nameCount.get(norm(e.fullName)) === 1) byName.set(norm(e.fullName), e)
  const byCode = new Map()
  for (const e of employees) {
    if (e.employeeCode) byCode.set(e.employeeCode.trim().toUpperCase(), e)
    if (e.legacyEmployeeCode) byCode.set(e.legacyEmployeeCode.trim().toUpperCase(), e)
  }

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${TAB}\n${'='.repeat(78)}`)
  const unmatched = []
  const conflicts = []
  let clearances = 0, empUpdates = 0

  for (const r of rows) {
    const code = col(r, 'Employee ID')
    const name = col(r, 'Full Name')
    const sheetStatus = col(r, 'Status')

    // Name first — the sheet's employee codes are stale against the DB.
    const byNameHit = byName.get(norm(name))
    const byCodeHit = byCode.get(code.toUpperCase())
    const emp = byNameHit ?? (byCodeHit && norm(byCodeHit.fullName) === norm(name) ? byCodeHit : null)
    if (!emp) { unmatched.push(`${code} ${name} (${sheetStatus})`); continue }

    const m = mapStatus(sheetStatus)
    const lwd = xlDate(col(r, 'Last Working Date'))
    const interviewDone = yes(col(r, 'Exit Interview Done'))

    const docs = DOC_COLS.map((c) => {
      const v = col(r, c)
      if (!v) return null
      return `${c.replace(/ \(.*\)/, '')}: ${na(v) ? 'N/A' : v}`
    }).filter(Boolean)
    const notes = `Imported from master sheet "${TAB}" (${sheetStatus}). ${docs.join('; ')}.`

    // ── ExitClearance ──
    const assetsBack = yes(col(r, 'Assets Returned'))
    const clearanceData = {
      lastWorkingDay: lwd,
      triggerType: m ? m.trigger : 'OTHER',
      settlementNotes: notes,
      interviewCompletedAt: interviewDone && lwd ? lwd : null,
      status: assetsBack ? 'COMPLETED' : 'IN_PROGRESS',
      completedAt: assetsBack && lwd ? lwd : null,
    }
    if (APPLY) {
      const existing = await prisma.exitClearance.findFirst({
        where: { employeeId: emp.id }, select: { id: true },
      })
      if (existing) await prisma.exitClearance.update({ where: { id: existing.id }, data: clearanceData })
      else await prisma.exitClearance.create({ data: { employeeId: emp.id, ...clearanceData } })
    }
    clearances++

    // ── Employee: fill only what's missing ──
    // Guard: if the employee has payslips dated AFTER the sheet's last working
    // day, they were still on payroll then, so the sheet's exit is wrong (Ali
    // Shan is listed as leaving 2026-05-08 but was paid in June and July).
    // Marking them terminated would both assert something false and drop them
    // from future payroll runs, so leave the employee row alone and report it.
    let paidAfterExit = 0
    if (lwd) {
      paidAfterExit = await prisma.payslip.count({
        where: {
          employeeId: emp.id,
          OR: [
            { year: { gt: lwd.getUTCFullYear() } },
            { year: lwd.getUTCFullYear(), month: { gt: lwd.getUTCMonth() + 1 } },
          ],
        },
      })
    }
    const empData = {}
    if (paidAfterExit > 0) {
      conflicts.push(`${emp.employeeCode} ${name}: sheet says left ${lwd.toISOString().slice(0, 10)} but has ${paidAfterExit} payslip(s) after that — employee row untouched`)
    } else {
    if (m) {
      if (emp.status === 'ACTIVE' || emp.status === 'PROBATION') empData.status = m.status
      else if (emp.status !== m.status) conflicts.push(`${emp.employeeCode} ${name}: app status ${emp.status}, sheet ${m.status} — kept app`)
      if (!emp.terminationType) empData.terminationType = m.terminationType
    }
    if (lwd && !emp.exitDate) empData.exitDate = lwd
    else if (lwd && emp.exitDate && Math.abs(emp.exitDate - lwd) > 86400000) {
      conflicts.push(`${emp.employeeCode} ${name}: app exitDate ${emp.exitDate.toISOString().slice(0, 10)}, sheet ${lwd.toISOString().slice(0, 10)} — kept app`)
    }
    }

    if (Object.keys(empData).length) {
      if (APPLY) await prisma.employee.update({ where: { id: emp.id }, data: empData })
      empUpdates++
    }

    console.log(`  ${emp.employeeCode.padEnd(15)} ${name.padEnd(22)} ${String(sheetStatus).padEnd(22)} LWD ${lwd ? lwd.toISOString().slice(0, 10) : '—'.padEnd(10)}  ${clearanceData.status}${Object.keys(empData).length ? '  emp:' + Object.keys(empData).join(',') : ''}`)
  }

  console.log(`\nexit clearances ${APPLY ? 'written' : 'to write'}: ${clearances}`)
  console.log(`employee rows ${APPLY ? 'updated' : 'to update'}: ${empUpdates}`)
  if (conflicts.length) {
    console.log(`\nCONFLICTS — app value kept, sheet value not applied (${conflicts.length}):`)
    for (const c of conflicts) console.log('  ' + c)
  }
  if (unmatched.length) {
    console.log(`\nno matching employee (${unmatched.length}) — skipped:`)
    for (const u of unmatched) console.log('  ' + u)
  }
  if (!APPLY) console.log('\nNothing written. Re-run with --apply.')
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })

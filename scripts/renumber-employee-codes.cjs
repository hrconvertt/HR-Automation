/**
 * Renumber employeeCode to match the Convertt master sheet.
 *
 * The sheet's scheme is  CON-<Dept Code>-<SR #>  where SR # is a single global
 * running number, not a per-department one. The database had numbered per
 * department, so most codes disagree — and some codes belong to a *different
 * person* in each system (CON-HR-001 is Syed Khawer in the sheet and Tahreem
 * Waheed in the database). That is why this exists as a deliberate one-off
 * rather than a field edit.
 *
 * Matching is by NAME, never by code: the codes are precisely what's in
 * dispute. Exact match only, plus explicitly confirmed aliases — partial-name
 * guessing is what previously folded "Muhammad Hassan" into "Ali Hassan".
 *
 * Written in two phases because employeeCode is unique: moving CON-HR-001 from
 * one person to another collides if done in one pass, so every affected row is
 * first parked on a temporary code and then given its final one.
 *
 * Run:  node scripts/renumber-employee-codes.cjs [--apply]
 */
require('dotenv').config({ path: '.env.local' })
const XLSX = require('xlsx')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
})
const APPLY = process.argv.includes('--apply')
const FILE = process.env.MASTER_SHEET
  || 'C:/Users/HRConvertt/Downloads/Convertt - Automated Employee Management (1).xlsx'

/** Sheet name -> database name. Only names a human confirmed. */
const NAME_ALIASES = {
  'atta ur reman': 'Atta Ur Rehman',
  'waqas': 'Muhammad Waqas Fareed',
  // Confirmed by the user earlier when importing the info form.
  'zuhaa jutt': 'Zuhaa Shafi',
  'salman shahid': 'Muhammad Salman Shahid',
  // The sheet drops a first or last name; one candidate each in the directory.
  'usman saeed': 'Muhammad Usman Saeed',
  'usama aslam': 'Muhammad Usama Aslam',
  'muhammad hashir': 'Muhammad Hashir Siddiqui',
  'laiba manan': 'Laiba Mannan',
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()

async function main() {
  for (let i = 0; i < 6; i++) {
    try { await prisma.$queryRaw`SELECT 1`; break } catch (e) {
      if (i === 5) throw e
      await new Promise((r) => setTimeout(r, 3000))
    }
  }

  const wb = XLSX.readFile(FILE)
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets.Sheet1, { header: 1, defval: null })
  // Row 0 is blank; row 1 holds the real header.
  const hdr = (aoa[1] || []).map((h) => String(h ?? '').trim())
  const iName = hdr.indexOf('Name')
  const iCode = hdr.indexOf('Employee ID')
  if (iName === -1 || iCode === -1) throw new Error(`Could not find Name / Employee ID columns in: ${hdr.join(' | ')}`)

  const sheetRows = aoa.slice(2)
    .filter((r) => r && r[iName] && r[iCode])
    .map((r) => ({ name: String(r[iName]).trim(), code: String(r[iCode]).trim() }))

  const employees = await prisma.employee.findMany({
    select: { id: true, employeeCode: true, fullName: true },
  })
  const nameCount = new Map()
  for (const e of employees) nameCount.set(norm(e.fullName), (nameCount.get(norm(e.fullName)) || 0) + 1)
  const byName = new Map()
  for (const e of employees) if (nameCount.get(norm(e.fullName)) === 1) byName.set(norm(e.fullName), e)

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${sheetRows.length} rows in the sheet, ${employees.length} employees\n${'='.repeat(80)}`)

  const changes = []          // { emp, from, to }
  const unmatched = []
  const dupTargets = new Map()

  for (const row of sheetRows) {
    const target = NAME_ALIASES[norm(row.name)] ?? row.name
    const emp = byName.get(norm(target))
    if (!emp) { unmatched.push(row); continue }
    dupTargets.set(row.code, (dupTargets.get(row.code) || 0) + 1)
    if (emp.employeeCode === row.code) continue
    changes.push({ emp, from: emp.employeeCode, to: row.code })
  }

  // Two people cannot end up on the same code.
  const collisions = [...dupTargets.entries()].filter(([, n]) => n > 1)
  if (collisions.length) {
    console.log('ABORT — the sheet assigns one code to more than one matched person:')
    for (const [code, n] of collisions) console.log(`  ${code} used ${n} times`)
    await prisma.$disconnect()
    process.exit(1)
  }

  for (const c of changes) {
    console.log(`  ${c.emp.fullName.padEnd(26)} ${String(c.from ?? '—').padEnd(16)} -> ${c.to}`)
  }

  // Whose code is taken away and not reassigned by the sheet?
  const changedIds = new Set(changes.map((c) => c.emp.id))
  const untouched = employees.filter((e) => !changedIds.has(e.id) &&
    !sheetRows.some((r) => norm(NAME_ALIASES[norm(r.name)] ?? r.name) === norm(e.fullName)))

  console.log(`\n${'='.repeat(80)}`)
  console.log(`codes to change: ${changes.length}`)
  if (unmatched.length) {
    console.log(`\nin the sheet but no matching employee (${unmatched.length}) — skipped:`)
    for (const u of unmatched) console.log(`  ${u.code.padEnd(16)} ${u.name}`)
  }
  if (untouched.length) {
    console.log(`\nin the app but not in the sheet (${untouched.length}) — code left as-is:`)
    for (const e of untouched) console.log(`  ${String(e.employeeCode ?? '—').padEnd(16)} ${e.fullName}`)
  }

  if (!APPLY) {
    console.log('\nNothing written. Re-run with --apply.')
    await prisma.$disconnect()
    return
  }
  if (!changes.length) { await prisma.$disconnect(); return }

  // Phase 1: park every affected row on a code nothing else can hold, so the
  // unique index cannot trip while codes swap owners. Phase 2: final codes.
  await prisma.$transaction(async (tx) => {
    for (const c of changes) {
      await tx.employee.update({ where: { id: c.emp.id }, data: { employeeCode: `TMP-${c.emp.id.slice(-12)}` } })
    }
    for (const c of changes) {
      await tx.employee.update({ where: { id: c.emp.id }, data: { employeeCode: c.to } })
    }
  }, { timeout: 60000 })

  console.log(`\n${changes.length} code(s) updated.`)
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error(e.message || e); await prisma.$disconnect(); process.exit(1) })

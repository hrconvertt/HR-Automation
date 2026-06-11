/* eslint-disable */
/**
 * Audit imported employee data for completeness and integrity.
 *
 * Usage:
 *   DATABASE_URL=postgres://… node scripts/audit-imported-data.js
 *
 * Reports:
 *   • Employees missing email
 *   • Employees missing CNIC
 *   • Employees missing DOB
 *   • Employees with no reportingManagerId (skipping CEO / HR Admin)
 *   • Gaps in CON-<DEPT>-NNN code sequences
 *   • Duplicate emails
 *
 * Read-only — does NOT mutate any data. Safe to run against prod.
 */

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

function header(title) {
  console.log('\n' + '═'.repeat(72))
  console.log(title)
  console.log('═'.repeat(72))
}

function row(e) {
  return `  · ${e.employeeCode.padEnd(14)} ${(e.fullName ?? '').padEnd(28)} ${e.email ?? '—'}`
}

async function main() {
  const all = await prisma.employee.findMany({
    select: {
      id: true, employeeCode: true, fullName: true, email: true,
      cnic: true, dob: true, status: true,
      reportingManagerId: true, designation: true,
      user: { select: { role: true } },
    },
    orderBy: { employeeCode: 'asc' },
  })

  const active = all.filter((e) => e.status === 'ACTIVE')

  header(`Audit running over ${all.length} employees (${active.length} ACTIVE)`)

  // ── Missing email ──────────────────────────────────────────────────
  const missingEmail = active.filter((e) => !e.email || !e.email.trim())
  header(`Missing email: ${missingEmail.length}`)
  missingEmail.forEach((e) => console.log(row(e)))

  // ── Missing CNIC ───────────────────────────────────────────────────
  const missingCnic = active.filter((e) => !e.cnic || !e.cnic.trim())
  header(`Missing CNIC: ${missingCnic.length}`)
  missingCnic.forEach((e) => console.log(row(e)))

  // ── Missing DOB ────────────────────────────────────────────────────
  const missingDob = active.filter((e) => !e.dob)
  header(`Missing date of birth: ${missingDob.length}`)
  missingDob.forEach((e) => console.log(row(e)))

  // ── No reporting manager (excluding CEO / HR Admin tops of org) ────
  const TOP_KEYWORDS = ['ceo', 'chief executive', 'founder', 'head of people']
  const noMgr = active.filter((e) => {
    if (e.reportingManagerId) return false
    const desig = (e.designation ?? '').toLowerCase()
    if (TOP_KEYWORDS.some((k) => desig.includes(k))) return false
    if (e.user?.role === 'HR_ADMIN') return false
    return true
  })
  header(`No reporting manager (and not a top role): ${noMgr.length}`)
  noMgr.forEach((e) => console.log(row(e) + `   [${e.designation ?? 'no designation'}]`))

  // ── Gaps in employeeCode sequences (CON-<DEPT>-NNN) ────────────────
  // Group by prefix CON-XXX- then look for gaps in the numeric tail.
  const seqByPrefix = new Map()
  for (const e of all) {
    const m = (e.employeeCode ?? '').match(/^(CON-[A-Z0-9]+-)(\d+)$/)
    if (!m) continue
    const prefix = m[1]
    const n = parseInt(m[2], 10)
    if (!Number.isFinite(n)) continue
    if (!seqByPrefix.has(prefix)) seqByPrefix.set(prefix, [])
    seqByPrefix.get(prefix).push({ n, code: e.employeeCode })
  }
  const gaps = []
  for (const [prefix, list] of seqByPrefix.entries()) {
    const taken = new Set(list.map((x) => x.n))
    const max = Math.max(...list.map((x) => x.n))
    for (let i = 1; i < max; i++) {
      if (!taken.has(i)) gaps.push(`${prefix}${String(i).padStart(3, '0')}`)
    }
  }
  header(`Gaps in employee-code sequences: ${gaps.length}`)
  gaps.forEach((g) => console.log(`  · ${g}  (missing — next slot to fill)`))

  // ── Duplicate emails ───────────────────────────────────────────────
  const seen = new Map()
  const dups = []
  for (const e of all) {
    if (!e.email) continue
    const key = e.email.trim().toLowerCase()
    if (seen.has(key)) dups.push({ key, a: seen.get(key), b: e })
    else seen.set(key, e)
  }
  header(`Duplicate emails: ${dups.length}`)
  dups.forEach((d) => {
    console.log(`  Email: ${d.key}`)
    console.log(`    A: ${d.a.employeeCode}  ${d.a.fullName}  (${d.a.status})`)
    console.log(`    B: ${d.b.employeeCode}  ${d.b.fullName}  (${d.b.status})`)
  })

  console.log('\n✓ Audit complete (read-only — no data was modified).\n')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())

/**
 * Tidy the casing of employee text that people typed into the Google Form.
 *
 * Names, cities and relations arrived as "shafi muhammad", "rahat", "lahore",
 * "mother" — the app then shows exactly that on every screen. Fixing the stored
 * value fixes the profile, the directory, the org chart, payroll and every
 * letter template at once, which is why this normalises the data rather than
 * papering over it with a display helper.
 *
 * ONLY rewrites values that are entirely lower-case or entirely UPPER-CASE.
 * Anything already mixed-case was cased deliberately — "UI/UX", "McDonald",
 * "bin Qasim" — and is left exactly as it is. That single rule is what keeps
 * this safe to run repeatedly.
 *
 * Email and account-number fields are never touched.
 *
 * Run:  node scripts/normalize-employee-text.cjs [--apply]
 */
require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
})
const APPLY = process.argv.includes('--apply')

/** Free-text fields worth title-casing. No emails, no account numbers. */
const FIELDS = [
  'fullName', 'fatherOrHusbandName', 'mothersMaidenName',
  'placeOfBirth', 'cityOfBirth', 'placeOfIssuance', 'nationalityCountry',
  'emergencyContact', 'emergencyRelation',
  'address', 'temporaryAddress', 'workLocationAddress',
  // `bankName` is deliberately absent: it holds short codes (MBL, UBL, SCB,
  // NAYAP), not prose, and title-casing would turn them into "Mbl" / "Ubl".
  'bankAccountName', 'bankBranch',
  'gender', 'maritalStatus',
]

/** Stay upper-case: acronyms and initialisms that title-casing would ruin. */
const KEEP_UPPER = new Set([
  'HR', 'IT', 'UI', 'UX', 'CEO', 'CTO', 'COO', 'CFO', 'BD', 'QA', 'SEO', 'PPC',
  'CNIC', 'NTN', 'IBAN', 'PK', 'UAE', 'USA', 'UK', 'DHA', 'NGO', 'LLC',
])

/** Stay lower-case when they fall inside a phrase, not at the start. */
const KEEP_LOWER = new Set(['ur', 'bin', 'binte', 'al', 'of', 'and', 'the', 'da', 'de'])

function titleCaseWord(word, isFirst) {
  if (!word) return word
  const bare = word.replace(/[^A-Za-z]/g, '')
  if (bare && KEEP_UPPER.has(bare.toUpperCase())) return word.toUpperCase()
  const lower = word.toLowerCase()
  if (!isFirst && KEEP_LOWER.has(lower)) return lower
  // Capitalise after any separator so "abdul-rehman" and "ui/ux" both work.
  return lower.replace(/(^|[-'/.])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase())
}

function titleCase(value) {
  const parts = value.split(/(\s+)/)
  let wordIndex = 0
  return parts.map((p) => {
    if (/^\s+$/.test(p)) return p
    const out = titleCaseWord(p, wordIndex === 0)
    wordIndex++
    return out
  }).join('')
}

/** True when the value was typed without any deliberate casing. */
function needsFixing(v) {
  if (!v) return false
  const letters = v.replace(/[^A-Za-z]/g, '')
  if (letters.length < 2) return false
  return letters === letters.toLowerCase() || letters === letters.toUpperCase()
}

async function main() {
  for (let i = 0; i < 6; i++) {
    try { await prisma.$queryRaw`SELECT 1`; break } catch (e) {
      if (i === 5) throw e
      await new Promise((r) => setTimeout(r, 3000))
    }
  }

  const select = { id: true, employeeCode: true, fullName: true }
  for (const f of FIELDS) select[f] = true
  const employees = await prisma.employee.findMany({ select })

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — text casing across ${employees.length} employees\n${'='.repeat(78)}`)

  let changedEmployees = 0
  let changedValues = 0
  const perField = {}

  for (const emp of employees) {
    const data = {}
    const shown = []
    for (const f of FIELDS) {
      const v = emp[f]
      if (typeof v !== 'string' || !needsFixing(v)) continue
      const next = titleCase(v)
      if (next === v) continue
      data[f] = next
      shown.push(`      ${f}: "${v}" -> "${next}"`)
      perField[f] = (perField[f] || 0) + 1
      changedValues++
    }
    if (!Object.keys(data).length) continue
    if (APPLY) await prisma.employee.update({ where: { id: emp.id }, data })
    changedEmployees++
    console.log(`  ${(emp.employeeCode || '—').padEnd(14)} ${emp.fullName}`)
    for (const line of shown) console.log(line)
  }

  console.log(`\n${'='.repeat(78)}`)
  console.log(`${changedValues} value(s) across ${changedEmployees} employee(s) ${APPLY ? 'updated' : 'would change'}`)
  const rows = Object.entries(perField).sort((a, b) => b[1] - a[1])
  if (rows.length) {
    console.log('\nby field:')
    for (const [f, n] of rows) console.log(`  ${f.padEnd(24)} ${n}`)
  }
  if (!APPLY) console.log('\nNothing written. Re-run with --apply.')
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })

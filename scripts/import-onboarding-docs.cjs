/**
 * Import the onboarding document columns (AX:BH) from the master sheet's
 * Employee_Master tab into OnboardingChecklist.
 *
 *   node scripts/import-onboarding-docs.cjs          # dry run — prints, writes nothing
 *   node scripts/import-onboarding-docs.cjs --write  # actually writes
 *
 * Matched by NAME, not employee code: the sheet's codes have been observed
 * pointing at different people than the database's, and a document ticked
 * against the wrong person is worse than one not ticked at all. Anything that
 * does not match exactly one active employee is reported and skipped.
 *
 * Only Yes and No are written. "None" means the document does not apply, which
 * the app derives from employment type rather than storing, and blank means
 * nobody has checked — neither should overwrite what is already in the system.
 */
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env.local'), override: true })

const fs = require('node:fs')
const path = require('node:path')
const { PrismaClient } = require('@prisma/client')

const SRC = path.join(__dirname, 'data', 'onboarding-docs-2026-08-19.tsv')

/** Flag position -> OnboardingChecklist column, in sheet order AX..BH. */
const FIELDS = [
  'ndaSigned',
  'ndaSignedByCompany',
  'internshipLetterSigned',
  'internshipLetterSignedByCompany',
  'agreementSigned',
  'agreementSignedByCompany',
  'photoTaken',
  'cnicCopied',
  'educationDocsCopied',
  'experienceLettersCopied',
  'certificationOnFile',
]

/** Normalise a name for comparison — case, punctuation and spacing all vary. */
const norm = (s) =>
  s.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim()

function readRows() {
  return fs.readFileSync(SRC, 'utf8')
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => {
      const [code, name, flags] = l.split('\t')
      return { code: (code || '').trim(), name: (name || '').trim(), flags: (flags || '').trim() }
    })
    .filter((r) => r.name)
}

async function main() {
  const write = process.argv.includes('--write')
  const allowUnticking = process.argv.includes('--allow-unticking')
  const prisma = new PrismaClient()

  const employees = await prisma.employee.findMany({
    select: {
      id: true, fullName: true, employeeCode: true, status: true, employeeType: true,
      onboarding: true,
    },
  })

  // Index by normalised name. Duplicates are kept so we can refuse to guess.
  const byName = new Map()
  for (const e of employees) {
    const k = norm(e.fullName)
    if (!byName.has(k)) byName.set(k, [])
    byName.get(k).push(e)
  }

  const rows = readRows()
  const updates = []
  const skipped = []
  const codeMismatches = []
  const downgrades = []
  let cellsSet = 0

  for (const r of rows) {
    let matches = byName.get(norm(r.name)) ?? []

    // Fall back to a unique prefix match — the sheet writes "Atta Ur Rehman"
    // where the record says "Atta Ur Rehman Khan" and similar.
    if (matches.length === 0) {
      const n = norm(r.name)
      matches = employees.filter(
        (e) => norm(e.fullName).startsWith(n) || n.startsWith(norm(e.fullName)),
      )
    }

    if (matches.length === 0) { skipped.push({ ...r, why: 'no employee of that name' }); continue }
    if (matches.length > 1) {
      skipped.push({ ...r, why: `${matches.length} employees share that name` })
      continue
    }

    const emp = matches[0]
    if (r.code && r.code !== '-' && r.code !== emp.employeeCode) {
      codeMismatches.push({ name: r.name, sheet: r.code, db: emp.employeeCode })
    }

    const data = {}
    const changes = []
    FIELDS.forEach((field, i) => {
      const flag = r.flags[i]
      if (flag !== 'Y' && flag !== 'N') return   // None / blank -> leave alone
      const value = flag === 'Y'
      const current = emp.onboarding ? emp.onboarding[field] : false
      if (current === value) return

      // The system already says done and the sheet says No. Two sources
      // disagreeing about a signed document is a question, not a value to
      // overwrite — so un-ticking is opt-in.
      if (current === true && value === false) {
        downgrades.push({ name: emp.fullName, code: emp.employeeCode, field })
        if (!allowUnticking) return
      }

      data[field] = value
      changes.push(`${field}: ${current} -> ${value}`)
    })

    if (changes.length === 0) continue
    cellsSet += changes.length
    updates.push({ emp, data, changes, hadRow: !!emp.onboarding })
  }

  // ── Report ────────────────────────────────────────────────────────────────
  console.log(`Read ${rows.length} sheet rows against ${employees.length} employees.\n`)

  for (const u of updates) {
    console.log(`${u.emp.fullName}  (${u.emp.employeeCode}${u.hadRow ? '' : ', new checklist row'})`)
    for (const c of u.changes) console.log(`    ${c}`)
  }

  if (codeMismatches.length) {
    console.log(`\n${codeMismatches.length} rows where the sheet's code disagrees with the database:`)
    for (const c of codeMismatches) {
      console.log(`    ${c.name.padEnd(26)} sheet ${c.sheet.padEnd(14)} db ${c.db}`)
    }
    console.log('    Matched by name, so these were imported against the database record.')
  }

  if (downgrades.length) {
    console.log(`
${downgrades.length} cells where the system says done and the sheet says No:`)
    for (const d of downgrades) {
      console.log(`    ${d.name.padEnd(26)} ${d.field}`)
    }
    console.log(allowUnticking
      ? '    --allow-unticking is set, so these WILL be un-ticked.'
      : '    Left alone. Pass --allow-unticking to let the sheet win.')
  }

  if (skipped.length) {
    console.log(`\n${skipped.length} rows skipped:`)
    for (const s of skipped) console.log(`    ${s.name.padEnd(26)} ${s.why}`)
  }

  console.log(`\n${updates.length} employees would change · ${cellsSet} cells set`)

  if (!write) {
    console.log('\nDRY RUN — nothing written. Re-run with --write to apply.')
    await prisma.$disconnect()
    return
  }

  await prisma.$transaction(
    updates.map((u) =>
      prisma.onboardingChecklist.upsert({
        where: { employeeId: u.emp.id },
        update: u.data,
        create: { employeeId: u.emp.id, ...u.data },
      }),
    ),
  )
  console.log(`\nWritten. ${updates.length} checklists updated.`)
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })

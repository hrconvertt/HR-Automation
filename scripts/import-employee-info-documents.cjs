/**
 * Attach the CNIC images from the Employee Information Form as EmployeeDocument
 * rows, so they show in the employee's Documents rather than living only in the
 * form's Drive folder.
 *
 * The form stores Google Drive links, not files. Those links are recorded in
 * `url`; `fileBlob` stays empty because fetching the bytes needs Drive
 * credentials this import doesn't have (and shouldn't hold). Anyone opening the
 * document follows the link into Drive, where normal Drive permissions apply.
 *
 * CNIC scans are identity documents: `visibleToEmployee` is true (it's their own
 * ID), but they are not exposed to managers by the Documents UI's HR-only
 * filtering.
 *
 * Idempotent: a document with the same employee + url is never created twice.
 *
 * Run:  node scripts/import-employee-info-documents.cjs [--apply]
 */
const XLSX = require('xlsx')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
})
const APPLY = process.argv.includes('--apply')
const FILE = process.env.INFO_FORM
  || 'C:/Users/HRConvertt/Downloads/Employee Information Form (Responses) (2).xlsx'

// Confirmed by the user — same people, different name on the form.
const NAME_ALIASES = {
  'zuhaa jutt': 'Zuhaa Shafi',
  'salman shahid': 'Muhammad Salman Shahid',
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()
const str = (v) => { const s = String(v ?? '').trim(); return s && s !== '-' ? s : null }

const DOCS = [
  { header: 'Upload CNIC Front Image', type: 'CNIC', name: 'CNIC — Front' },
  { header: 'Upload CNIC Back Image', type: 'CNIC', name: 'CNIC — Back' },
]

async function main() {
  for (let i = 0; i < 6; i++) {
    try { await prisma.$queryRaw`SELECT 1`; break } catch (e) {
      if (i === 5) throw e
      await new Promise((r) => setTimeout(r, 3000))
    }
  }

  const wb = XLSX.readFile(FILE)
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null })
  const hdr = aoa[0].map((h) => (h === null ? '' : String(h).trim()))
  const rows = aoa.slice(1).filter((r) => r[1] && String(r[1]).trim())
  const col = (r, name) => {
    const i = hdr.indexOf(name)
    return i === -1 ? null : r[i]
  }

  const employees = await prisma.employee.findMany({ select: { id: true, employeeCode: true, fullName: true } })
  const nameCount = new Map()
  for (const e of employees) nameCount.set(norm(e.fullName), (nameCount.get(norm(e.fullName)) || 0) + 1)
  const byName = new Map()
  for (const e of employees) if (nameCount.get(norm(e.fullName)) === 1) byName.set(norm(e.fullName), e)

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — CNIC images from the info form\n${'='.repeat(70)}`)
  let created = 0, skipped = 0
  const noCnicName = []

  for (const r of rows) {
    const formName = String(col(r, 'Name') || '').trim()
    const emp = byName.get(norm(NAME_ALIASES[norm(formName)] ?? formName))
    if (!emp) continue

    // Captured by the form but with no Employee column to hold it.
    const cnicName = str(col(r, 'Full Name (as per CNIC)'))
    if (cnicName && norm(cnicName) !== norm(emp.fullName)) {
      noCnicName.push(`${emp.employeeCode} ${emp.fullName}: CNIC name "${cnicName}"`)
    }

    for (const d of DOCS) {
      const url = str(col(r, d.header))
      if (!url) continue
      const exists = await prisma.employeeDocument.findFirst({
        where: { employeeId: emp.id, url }, select: { id: true },
      })
      if (exists) { skipped++; continue }
      if (APPLY) {
        await prisma.employeeDocument.create({
          data: {
            employeeId: emp.id,
            type: d.type,
            name: d.name,
            url,
            visibleToEmployee: true,
          },
        })
      }
      created++
      console.log(`  ${emp.employeeCode.padEnd(15)} ${emp.fullName.padEnd(24)} ${d.name}`)
    }
  }

  console.log(`\ndocuments ${APPLY ? 'created' : 'to create'}: ${created}   already present: ${skipped}`)
  if (noCnicName.length) {
    console.log(`\n"Full Name (as per CNIC)" differs from the app's name (${noCnicName.length}) — no field to store it:`)
    for (const n of noCnicName) console.log('  ' + n)
  }
  if (!APPLY) console.log('\nNothing written. Re-run with --apply.')
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })

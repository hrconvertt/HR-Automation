/**
 * Import "Employee Information Form (Responses)" — the Google Form employees
 * fill in with their own personal and professional details.
 *
 * Nearly every column already has a nullable field on Employee, so no schema
 * change is needed and the fields already exist for everyone (as null) — an
 * employee who hasn't submitted the form simply has them empty.
 *
 * Only ever FILLS BLANKS. A value already in the app is never overwritten from
 * a form response: people mistype their own CNIC and IBAN, and payroll depends
 * on the account number. Differences are reported instead.
 *
 * Run:  node scripts/import-employee-info-form.cjs [--apply]
 */
const XLSX = require('xlsx')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
})
const APPLY = process.argv.includes('--apply')
const FILE = process.env.INFO_FORM
  || 'C:/Users/HRConvertt/Downloads/Employee Information Form (Responses) (2).xlsx'

/**
 * Form name -> employee record, where the person filled the form under a
 * different name than the app holds. Confirmed by the user, not inferred:
 * partial-name guessing is what merged "Muhammad Hassan" into "Ali Hassan"
 * earlier in this data work.
 */
const NAME_ALIASES = {
  'zuhaa jutt': 'Zuhaa Shafi',
  'salman shahid': 'Muhammad Salman Shahid',
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()
const str = (v) => { const s = String(v ?? '').trim(); return s && s !== '-' ? s : null }

/** Excel serial or text date -> Date | null. */
function toDate(v) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number' && v > 20000) return new Date(Math.round((v - 25569) * 86400 * 1000))
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d
}

/** Column header -> Employee field. Headers are matched loosely (trimmed). */
const MAP = {
  'Phone': 'phone',
  'Gender': 'gender',
  'DOB': 'dob',
  'Current Address': 'temporaryAddress',
  'CNIC Number': 'cnic',
  'IBAN Number': 'ibanAccount',
  'Upload your Profile Image': 'photoUrl',
  'Name 2': 'emergencyContact',
  'Relation': 'emergencyRelation',
  'Phone 2': 'emergencyPhone',
  'Email 2': 'emergencyEmail',
  'FATHER_HUSBAND_NAME': 'fatherOrHusbandName',
  'MOTHERS_MAIDEN_NAME': 'mothersMaidenName',
  'CNIC - DT_OF_ISSUANCE': 'cnicIssuedOn',
  'CNIC - EXPIRY_DATE': 'cnicExpiresOn',
  'CNIC - BIRTH_DATE': 'cnicBirthDate',
  'CNIC -PLACE_OF_BIRTH': 'placeOfBirth',
  'Marital Status': 'maritalStatus',
  'Permanent Address': 'address',
}
const DATE_FIELDS = new Set(['dob', 'cnicIssuedOn', 'cnicExpiresOn', 'cnicBirthDate'])

// Captured by the form but with no matching Employee column. Folded into the
// composed address or reported, never silently dropped.
const ADDRESS_PARTS = ['Address Line 1', 'Address Line 2', 'City', 'State / Province', 'Postal Code', 'Country']

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
    let i = hdr.indexOf(name)
    if (i === -1) i = hdr.findIndex((h) => h.replace(/\s+/g, ' ').trim() === name)
    return i === -1 ? null : r[i]
  }

  const employees = await prisma.employee.findMany({
    select: {
      id: true, employeeCode: true, fullName: true, phone: true, gender: true, dob: true,
      cnic: true, ibanAccount: true, address: true, temporaryAddress: true, photoUrl: true,
      emergencyContact: true, emergencyRelation: true, emergencyPhone: true, emergencyEmail: true,
      fatherOrHusbandName: true, mothersMaidenName: true, cnicIssuedOn: true, cnicExpiresOn: true,
      cnicBirthDate: true, placeOfBirth: true, maritalStatus: true,
    },
  })
  const nameCount = new Map()
  for (const e of employees) nameCount.set(norm(e.fullName), (nameCount.get(norm(e.fullName)) || 0) + 1)
  const byName = new Map()
  for (const e of employees) if (nameCount.get(norm(e.fullName)) === 1) byName.set(norm(e.fullName), e)

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — Employee Information Form\n${'='.repeat(76)}`)
  const unmatched = []
  const conflicts = []
  let updated = 0

  for (const r of rows) {
    const name = String(col(r, 'Name') || '').trim()
    const aliased = NAME_ALIASES[norm(name)]
    const emp = byName.get(norm(aliased ?? name))
    if (!emp) { unmatched.push(name); continue }

    const data = {}
    for (const [header, field] of Object.entries(MAP)) {
      const raw = col(r, header)
      const val = DATE_FIELDS.has(field) ? toDate(raw) : str(raw)
      if (val === null) continue
      const current = emp[field]
      if (current === null || current === undefined || current === '') {
        data[field] = val
      } else {
        const same = current instanceof Date
          ? Math.abs(current - val) < 86400000
          : String(current).trim() === String(val).trim()
        if (!same) {
          conflicts.push(`${emp.employeeCode} ${name} · ${field}: app "${current instanceof Date ? current.toISOString().slice(0, 10) : current}" vs form "${val instanceof Date ? val.toISOString().slice(0, 10) : val}" — kept app`)
        }
      }
    }

    // Compose a permanent address from the split fields only if the employee
    // has none and the form didn't supply the single-field version.
    if (!data.address && !emp.address) {
      const parts = ADDRESS_PARTS.map((p) => str(col(r, p))).filter(Boolean)
      if (parts.length) data.address = parts.join(', ')
    }

    if (Object.keys(data).length === 0) {
      console.log(`  ${emp.employeeCode.padEnd(15)} ${name.padEnd(24)} nothing to fill`)
      continue
    }
    if (APPLY) await prisma.employee.update({ where: { id: emp.id }, data })
    updated++
    console.log(`  ${emp.employeeCode.padEnd(15)} ${name.padEnd(24)} +${Object.keys(data).length}: ${Object.keys(data).join(', ')}`)
  }

  console.log(`\nemployees ${APPLY ? 'updated' : 'to update'}: ${updated} of ${rows.length} responses`)
  if (conflicts.length) {
    console.log(`\nDIFFERENCES — app value kept, form value not applied (${conflicts.length}):`)
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

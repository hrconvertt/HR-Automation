/**
 * scripts/enrich-employee-personal-info.cjs
 *
 * Enriches existing Employee rows with personal info from two xlsx forms:
 *   1. Employee Information Form (Responses).xlsx — 5 rows, full profile
 *   2. BPM_Convertt Banking Process (Responses)(1).xlsx — many rows
 *
 * Rules:
 *   - NEVER creates new employees. Only updates existing rows.
 *   - NEVER overwrites a non-empty field. Only fills null / empty strings.
 *   - Prefers Employee Info Form values over BPM when both have a value.
 *   - Salary / Income column is intentionally ignored (lives in Salary model).
 *   - Idempotent — safe to re-run; subsequent runs are no-ops.
 *
 * Run with prod DATABASE_URL:
 *   node scripts/enrich-employee-personal-info.cjs
 */

const XLSX = require('xlsx')
const { PrismaClient } = require('@prisma/client')

const EMP_INFO_PATH = String.raw`C:\Users\HRConvertt\Downloads\Employee Information Form (Responses).xlsx`
const BPM_PATH = String.raw`C:\Users\HRConvertt\Downloads\BPM_Convertt Banking Process (Responses)(1).xlsx`

// ─── Fuzzy name matcher (mirrors scripts/fix-org-hierarchy.js) ──────────────
const HONORIFICS = new Set([
  'mr', 'mrs', 'ms', 'miss', 'sir', 'madam',
  'syed', 'sheikh', 'shaikh', 'muhammad', 'mohammad', 'mohd', 'md', 'm',
  'hafiz', 'qari', 'engr', 'dr', 'prof',
])

function tokens(name) {
  if (!name) return []
  return String(name)
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !HONORIFICS.has(t))
}

function fuzzyMatch(query, employees) {
  const qTokens = tokens(query)
  if (qTokens.length === 0) return null
  const qSet = new Set(qTokens)

  let best = null
  let bestScore = 0

  for (const e of employees) {
    const eTokens = tokens(e.fullName)
    if (eTokens.length === 0) continue
    const eSet = new Set(eTokens)

    let overlap = 0
    for (const t of qSet) if (eSet.has(t)) overlap++
    if (overlap === 0) continue

    const exact =
      e.fullName.toLowerCase().includes(String(query).trim().toLowerCase()) ||
      String(query).toLowerCase().includes(e.fullName.toLowerCase())
    const score = overlap * 10 + (exact ? 5 : 0) - Math.abs(eTokens.length - qTokens.length)

    if (score > bestScore) {
      bestScore = score
      best = e
    }
  }

  if (qTokens.length === 1 && bestScore < 10) return null
  if (qTokens.length >= 2 && bestScore < 20) return null

  return best
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function isEmpty(v) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
}

function clean(v) {
  if (isEmpty(v)) return null
  if (typeof v === 'string') return v.trim().replace(/\s+/g, ' ')
  return v
}

function excelDateToJs(v) {
  if (v === null || v === undefined || v === '') return null
  // Numeric Excel serial date
  if (typeof v === 'number' && isFinite(v) && v > 1000 && v < 80000) {
    // 25569 = days between 1899-12-30 and 1970-01-01
    const d = new Date(Math.round((v - 25569) * 86400 * 1000))
    if (isNaN(d.getTime())) return null
    return d
  }
  if (typeof v === 'string') {
    const s = v.trim()
    if (!s || s.toLowerCase() === 'nil') return null
    // Try dd-mm-yyyy / dd/mm/yyyy
    const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/)
    if (m) {
      let [, dd, mm, yy] = m
      if (yy.length === 2) yy = (parseInt(yy) > 50 ? '19' : '20') + yy
      const d = new Date(Date.UTC(parseInt(yy), parseInt(mm) - 1, parseInt(dd)))
      if (!isNaN(d.getTime()) && d.getUTCFullYear() > 1900 && d.getUTCFullYear() < 2100) return d
    }
    // Generic Date.parse
    const d = new Date(s)
    if (!isNaN(d.getTime()) && d.getUTCFullYear() > 1900 && d.getUTCFullYear() < 2100) return d
    console.warn(`  ⚠ Could not parse date: "${s}"`)
    return null
  }
  if (v instanceof Date) return v
  return null
}

function normalizeMarital(v) {
  if (isEmpty(v)) return null
  const s = String(v).trim().toLowerCase()
  if (s.startsWith('unmar') || s.startsWith('single')) return 'Single'
  if (s.startsWith('mar')) return 'Married'
  if (s.startsWith('div')) return 'Divorced'
  if (s.startsWith('wid')) return 'Widowed'
  return clean(v)
}

function normalizeGender(v) {
  if (isEmpty(v)) return null
  const s = String(v).trim().toLowerCase()
  if (s.startsWith('m')) return 'Male'
  if (s.startsWith('f')) return 'Female'
  return clean(v)
}

function normalizeCnic(v) {
  if (isEmpty(v)) return null
  const digits = String(v).replace(/\D/g, '')
  if (digits.length !== 13) return clean(v) // keep as-is if malformed
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`
}

function readSheet(path) {
  const wb = XLSX.readFile(path)
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { defval: null })
}

// ─── Map a row to candidate updates ────────────────────────────────────────
function mapEmpInfoRow(row) {
  const name = clean(row['Full Name (as per CNIC)']) || clean(row['Name'])
  if (!name) return null

  // Permanent address — combine HOME_ADDRESS_PERMANENT + Permanent Address
  const permParts = [clean(row['HOME_ADDRESS _PERMANENT']), clean(row['Permanent Address'])]
    .filter(Boolean)
  const permanent = permParts.length ? [...new Set(permParts)].join(', ') : null

  // Current/temporary address — combine address lines + Current Address
  const tempParts = [
    clean(row['Address Line 1']),
    clean(row['Address Line 2']),
    clean(row['City']),
    clean(row['State / Province  ']),
    clean(row['Postal Code  ']),
    clean(row['Country  ']),
  ].filter(Boolean)
  const tempAddr = tempParts.length
    ? tempParts.join(', ')
    : clean(row['Current Address'])

  return {
    matchName: name,
    fields: {
      phone: clean(row['Phone']),
      gender: normalizeGender(row['Gender']),
      dob: excelDateToJs(row['DOB']),
      cnic: normalizeCnic(row['CNIC Number']),
      ibanAccount: clean(row['IBAN Number']),
      photoUrl: clean(row['Upload your Profile Image']),
      address: permanent,
      temporaryAddress: tempAddr,
      emergencyContact: clean(row['Name 2']),
      emergencyPhone: clean(row['Phone 2']),
      emergencyRelation: clean(row['Relation']),
      emergencyEmail: clean(row['Email 2']),
      fatherOrHusbandName: clean(row['FATHER_HUSBAND_NAME']),
      mothersMaidenName: clean(row['MOTHERS_MAIDEN_NAME']),
      cnicIssuedOn: excelDateToJs(row['CNIC - DT_OF_ISSUANCE']),
      cnicExpiresOn: excelDateToJs(row['CNIC - EXPIRY_DATE']),
      cnicBirthDate: excelDateToJs(row['CNIC - BIRTH_DATE']),
      placeOfBirth: clean(row['CNIC -PLACE_OF_BIRTH']),
      maritalStatus: normalizeMarital(row['  Marital Status  ']),
      nationalityCountry: clean(row['Country  ']) || 'Pakistan',
    },
  }
}

function mapBpmRow(row) {
  const nameParts = [
    clean(row['First Name']),
    clean(row['Middle Name']),
    clean(row['Last Name']),
  ].filter(Boolean)
  const name = nameParts.join(' ')
  if (!name) return null

  return {
    matchName: name,
    fields: {
      phone: clean(row['MOBILE']),
      gender: normalizeGender(row['Gender']),
      maritalStatus: normalizeMarital(row['MARITAL STATUS']),
      fatherOrHusbandName: clean(row['FATHER/HUSBAND NAME']),
      mothersMaidenName: clean(row['MOTHERS_MAIDEN_NAME']),
      cnic: normalizeCnic(row['CNIC # ']),
      cnicIssuedOn: excelDateToJs(row['DATE_OF_ISSUANCE']),
      cnicExpiresOn: excelDateToJs(row['EXPIRY_DATE']),
      cnicBirthDate: excelDateToJs(row['BIRTH_DATE']),
      placeOfIssuance: clean(row['PLACE_OF_ISSUANCE']),
      placeOfBirth: clean(row['PLACE_OF_BIRTH']),
      cityOfBirth: clean(row['CITY_OF_BIRTH']),
      bankAccountName: clean(row['Account Name -Title of Account (Your Full Name)']),
      temporaryAddress: clean(row['Current Home_ADDRESS']) || clean(row['CORRECT HOME_ADDRESS']),
      address: clean(row['Permanent address']),
      workLocationAddress: clean(row['OFFICE_ADDRESS']),
      homePhone: clean(row['HOME_PHONE']),
      officePhone: clean(row['OFFICE_PHONE']),
      nationalityCountry: 'Pakistan',
    },
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const prisma = new PrismaClient()

  const employees = await prisma.employee.findMany()
  console.log(`Loaded ${employees.length} existing employees from DB.\n`)

  const empInfoRows = readSheet(EMP_INFO_PATH).map(mapEmpInfoRow).filter(Boolean)
  const bpmRows = readSheet(BPM_PATH).map(mapBpmRow).filter(Boolean)
  console.log(`Read ${empInfoRows.length} rows from Employee Information Form.`)
  console.log(`Read ${bpmRows.length} rows from BPM Banking Form.\n`)

  // Build merged per-employee record, preferring EmpInfo over BPM per-field.
  // Key by matched employee id.
  const perEmpUpdates = new Map() // empId -> {fields, sources: Set<string>}
  const unmatched = []

  function ingest(row, source) {
    const match = fuzzyMatch(row.matchName, employees)
    if (!match) {
      unmatched.push({ source, name: row.matchName })
      return
    }
    if (!perEmpUpdates.has(match.id)) {
      perEmpUpdates.set(match.id, { fields: {}, sources: new Set(), employee: match })
    }
    const bucket = perEmpUpdates.get(match.id)
    bucket.sources.add(source)
    for (const [k, v] of Object.entries(row.fields)) {
      if (isEmpty(v)) continue
      // EmpInfo wins: only set if not already set OR source is EmpInfo
      if (!(k in bucket.fields) || source === 'EmpInfo') {
        bucket.fields[k] = v
      }
    }
  }

  // BPM first, then EmpInfo so EmpInfo overrides at the source-merge stage.
  for (const row of bpmRows) ingest(row, 'BPM')
  for (const row of empInfoRows) ingest(row, 'EmpInfo')

  // Apply per-field "only fill if empty" rule against the live DB values.
  const fieldCounts = {}
  let updatedCount = 0
  let alreadyComplete = 0
  const phoneWarnings = []

  for (const [empId, bucket] of perEmpUpdates) {
    const emp = bucket.employee
    const updates = {}
    for (const [field, val] of Object.entries(bucket.fields)) {
      const dbVal = emp[field]
      if (isEmpty(dbVal)) {
        updates[field] = val
      } else if (field === 'phone' && String(dbVal).trim() !== String(val).trim()) {
        phoneWarnings.push(
          `Phone mismatch for ${emp.fullName}: DB='${dbVal}' vs xlsx='${val}' — kept DB.`
        )
      }
      // Otherwise: skip (DB already has a value; never overwrite).
    }

    if (Object.keys(updates).length === 0) {
      alreadyComplete++
      console.log(`= Already complete: ${emp.fullName}`)
      continue
    }

    await prisma.employee.update({ where: { id: empId }, data: updates })
    updatedCount++
    for (const k of Object.keys(updates)) {
      fieldCounts[k] = (fieldCounts[k] || 0) + 1
    }
    console.log(
      `✓ Updated ${emp.fullName} [${[...bucket.sources].join('+')}]: ${Object.keys(updates).join(', ')}`
    )
  }

  console.log('\n─── Summary ───────────────────────────────────────')
  console.log(`Updated: ${updatedCount} employees`)
  console.log(`Already complete: ${alreadyComplete} employees`)
  console.log(`Unmatched xlsx rows: ${unmatched.length}`)
  if (unmatched.length) {
    for (const u of unmatched) console.log(`  - [${u.source}] ${u.name}`)
  }
  console.log('\nNew fields populated this run:')
  for (const [field, count] of Object.entries(fieldCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${field}: ${count}`)
  }
  if (phoneWarnings.length) {
    console.log('\nPhone reconciliation warnings:')
    for (const w of phoneWarnings) console.log(`  ${w}`)
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

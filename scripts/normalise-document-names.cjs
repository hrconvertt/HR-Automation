/**
 * Strip employee names out of document titles.
 *
 * Documents were filed by hand, so the titles carry the filer's habits rather
 * than a convention: "Profile photo — Ali Hassan" sitting next to a plain
 * "NDA". On the employee's own record the name is already on the page, and
 * repeating it makes every row read differently from the next.
 *
 * A period is not a name — "Salary Slip — May 2026" is left alone, because May
 * and June are genuinely different documents.
 *
 * Dry run by default. Pass --apply to write.
 */
require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function withoutEmployeeName(name, fullName) {
  const parts = fullName.trim().split(/\s+/).filter((x) => x.length > 2)
  let out = name
  out = out.replace(new RegExp('\\s*[\u2014\u2013-]\\s*' + escapeRe(fullName) + '\\s*$', 'i'), '')
  out = out.replace(new RegExp('\\s*\\(' + escapeRe(fullName) + '\\)\\s*', 'i'), ' ')
  out = out.replace(new RegExp('^\\s*' + escapeRe(fullName) + '\\s*[-\u2014\u2013_]?\\s*', 'i'), '')
  for (const q of parts) {
    out = out.replace(new RegExp('\\s*[\u2014\u2013\\-_]\\s*' + escapeRe(q) + '\\s*$', 'i'), '')
  }
  out = out.replace(/\s{2,}/g, ' ').replace(/^[\s\-\u2014\u2013_]+|[\s\-\u2014\u2013_]+$/g, '')
  if (!out) return null
  out = out.charAt(0).toUpperCase() + out.slice(1)
  return out === name ? null : out
}

// The canonical label per type, so "CNIC Front.pdf" and "cnic.jpeg" land on the
// same words in the same case rather than on whatever the uploader typed.
const TYPE_LABEL = {
  CNIC: 'CNIC', PHOTO: 'Profile Photo', ADDRESS_PROOF: 'Address Proof',
  RESUME: 'Resume', EDUCATIONAL_CERTIFICATE: 'Educational Certificate',
  EXPERIENCE: 'Experience Letter', OFFER_LETTER: 'Offer Letter', NDA: 'NDA',
  SALARY_SLIP: 'Salary Slip', MEDICAL_REPORT: 'Medical Report',
  INSURANCE_CARD: 'Insurance Card', VACCINATION_RECORD: 'Vaccination Record',
  BANK_STATEMENT: 'Bank Statement', VISA_PASSPORT: 'Visa / Passport',
  REFERENCE_LETTER: 'Reference Letter', TRAINING_CERTIFICATE: 'Training Certificate',
  DRIVING_LICENSE: 'Driving License', SALARY_HISTORY: 'Salary History',
  TAX_CERTIFICATE: 'Tax Certificate',
}

const MONTHS = {
  jan: 'January', feb: 'February', mar: 'March', apr: 'April', may: 'May',
  jun: 'June', jul: 'July', aug: 'August', sep: 'September', oct: 'October',
  nov: 'November', dec: 'December',
}

const stripExt = (s) => s.replace(/(\.(pdf|docx?|jpe?g|png|xlsx?|csv))+$/i, '')

/**
 * A qualifier worth keeping: the month a slip covers, or which side of a CNIC.
 * Everything else \u2014 "(1)", "Month of", stray underscores \u2014 is filing noise.
 */
function qualifier(rest) {
  const m = rest.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*'?\s*(\d{2,4})/i)
  if (m) {
    const year = m[2].length === 2 ? '20' + m[2] : m[2]
    return MONTHS[m[1].toLowerCase().slice(0, 3)] + ' ' + year
  }
  const side = rest.match(/\b(front|back)\b/i)
  if (side) return side[1][0].toUpperCase() + side[1].slice(1).toLowerCase()
  return null
}

/** The name this document should carry, or null if it already carries it. */
function canonical(name, type, fullName) {
  const base = stripExt(withoutEmployeeName(name, fullName) ?? name)
  const label = TYPE_LABEL[type]
  if (!label) {
    // Unknown/OTHER type \u2014 tidy what is there rather than invent a label.
    const tidy = base.replace(/\s*\(\d+\)\s*$/, '').replace(/[_]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
    const out = tidy ? tidy.charAt(0).toUpperCase() + tidy.slice(1) : null
    return out && out !== name ? out : null
  }
  const q = qualifier(base)
  const out = q ? label + ' \u2014 ' + q : label
  return out === name ? null : out
}

;(async () => {
  const docs = await p.employeeDocument.findMany({
    select: { id: true, name: true, type: true, employee: { select: { fullName: true } } },
    orderBy: { name: 'asc' },
  })
  let changed = 0
  for (const d of docs) {
    if (!d.employee) continue
    const next = canonical(d.name, d.type, d.employee.fullName)
    if (!next) continue
    changed++
    console.log((APPLY ? 'RENAME      : ' : 'would rename: ') + '"' + d.name + '"  ->  "' + next + '"')
    if (APPLY) await p.employeeDocument.update({ where: { id: d.id }, data: { name: next } })
  }
  console.log('\n' + docs.length + ' documents, ' + changed + (APPLY ? ' renamed.' : ' to rename.'))
  if (!APPLY && changed) console.log('Re-run with --apply to write.')
  await p.$disconnect()
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })

/**
 * scripts/sync-designations.cjs
 *
 * Repairs Employee.designation for everyone whose original import collapsed
 * the master sheet's title into "Staff" (or some other generic placeholder).
 *
 * Source of truth:
 *   1. Master Sheet — Employee_Master tab → Designation column (fuzzy-matched
 *      by Full Name, honorifics stripped, same matcher as fix-org-hierarchy.js).
 *   2. Hard-coded FALLBACK table below — used when the sheet has no
 *      designation cell or the row is missing.
 *
 * Idempotent. Run locally with DATABASE_URL pointing at production:
 *   node scripts/sync-designations.cjs
 *
 * Prints `<name>: "<old>" → "<new>"` per update and a summary at the end.
 */

const XLSX = require('xlsx')
const { PrismaClient } = require('@prisma/client')

const SHEET_PATH = String.raw`C:\Users\HRConvertt\Downloads\Master Sheet - Convertt_HR (2).xlsx`

// ─── Fuzzy name matcher (mirrors fix-org-hierarchy.js) ──────────────────────
const HONORIFICS = new Set([
  'mr', 'mrs', 'ms', 'miss', 'sir', 'madam',
  'syed', 'sheikh', 'shaikh', 'muhammad', 'mohammad', 'mohd', 'md',
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
      e.fullName.toLowerCase().includes(query.trim().toLowerCase()) ||
      query.toLowerCase().includes(e.fullName.toLowerCase())
    const score = overlap * 10 + (exact ? 5 : 0) - Math.abs(eTokens.length - qTokens.length)
    if (score > bestScore) { bestScore = score; best = e }
  }
  if (qTokens.length === 1 && bestScore < 10) return null
  if (qTokens.length >= 2 && bestScore < 20) return null
  return best
}

// ─── Hard-coded fallback designations ───────────────────────────────────────
const FALLBACK = [
  { who: 'Syed Asghar Hassan',           designation: 'Chief Executive Officer' },
  { who: 'Syed Khawer Iqbal',            designation: 'Co-Founder & Head of Administration' },
  { who: 'Iqra Naveed',                  designation: 'Head of Business Development & Marketing' },
  { who: 'Tahreem Waheed',               designation: 'HR Associate' },
  { who: 'Syeda Manqbat Aelia',          designation: 'Finance Analyst' },
  { who: 'Abdullah Shafiq',              designation: 'Head of UI/UX Design' },
  { who: 'Atta Ur Rehman',               designation: 'Head of Client Servicing & Operations - Shopify' },
  { who: 'Aqib Aslam',                   designation: 'Senior WordPress Developer' },
  { who: 'Muhammad Waqas Fareed',        designation: 'Head of Client Servicing & Operations' },
  { who: 'Sheikh Taha Adnan',            designation: 'Senior Graphics & UI Designer' },
  { who: 'Altaf Yaseen',                 designation: 'Associate UI/UX Designer' },
  { who: 'Muhammad Usman Saeed',         designation: 'Associate UI/UX Designer' },
  { who: 'Muhammad Ammar Younas',        designation: 'UI/UX Designer' },
  { who: 'Ali Hassan',                   designation: 'UI/UX Designer' },
  { who: 'Umar Ameen',                   designation: 'UI/UX Designer' },
  { who: 'Zuhaa Jutt',                   designation: 'UI/UX Designer' },
  { who: 'Momna Waryam Khan',            designation: 'Lead Senior Software Engineer' },
  { who: 'Muzaffar Jamil',               designation: 'Shopify Developer' },
  { who: 'Muhammad Ahsan',               designation: 'Junior Shopify Developer' },
  { who: 'Ali Shan',                     designation: 'WordPress Developer' },
  { who: 'Muhammad Rayyan',              designation: 'Junior Shopify Developer' },
  { who: 'Muhammad Irfan',               designation: 'Junior Shopify Developer' },
  { who: 'Ayesha Akram',                 designation: 'Backend Intern' },
  { who: 'Mahnoor Riaz',                 designation: 'Backend Intern' },
  { who: 'Usman Ali',                    designation: 'Senior Video Editor' },
  { who: 'Tayyab Hussain',               designation: 'Junior Video Editor' },
  { who: 'Momin Munir',                  designation: 'Marketing Associate' },
  { who: 'Arslan',                       designation: 'Office Boy' },
  { who: 'Islam',                        designation: 'Office Boy' },
]

// Candidate column header names in the master sheet (the sheet has shifted
// between exports — try them in order).
const DESIG_COLS = [
  'Designation', 'Designation ', 'Job Title', 'Title', 'Role',
  'Current Designation', 'Position',
]

function pickDesignation(row) {
  for (const k of DESIG_COLS) {
    if (k in row && row[k] != null && String(row[k]).trim() !== '') {
      return String(row[k]).trim()
    }
  }
  return null
}

async function main() {
  const prisma = new PrismaClient()

  // Wake Neon if it's idle.
  for (let i = 1; i <= 10; i++) {
    try { await prisma.$queryRaw`SELECT 1`; break }
    catch (e) {
      if (i === 10) throw e
      console.log(`Waking Neon… ${i}/10`)
      await new Promise((r) => setTimeout(r, 4000))
    }
  }

  const allEmps = await prisma.employee.findMany({
    select: { id: true, fullName: true, designation: true },
  })
  console.log(`[scope] ${allEmps.length} employees in DB`)

  // Build desired map (employeeId → newDesignation). Sheet wins; fallback fills gaps.
  const desired = new Map()

  // 1. Load sheet
  let sheetRows = []
  try {
    const wb = XLSX.readFile(SHEET_PATH)
    const tab = wb.Sheets['Employee_Master']
    if (tab) sheetRows = XLSX.utils.sheet_to_json(tab, { defval: null })
    console.log(`[sheet] Loaded ${sheetRows.length} rows from Employee_Master`)
  } catch (e) {
    console.warn(`[sheet] Could not load ${SHEET_PATH}: ${e.message}`)
    console.warn(`[sheet] Falling back to hard-coded table only.`)
  }

  let sheetMatched = 0
  let sheetUnmatched = 0
  for (const r of sheetRows) {
    const name = r['Full Name'] || r['Name'] || r['Employee Name']
    if (!name) continue
    const desig = pickDesignation(r)
    if (!desig) continue
    const person = fuzzyMatch(name, allEmps)
    if (!person) { sheetUnmatched++; continue }
    desired.set(person.id, desig)
    sheetMatched++
  }
  console.log(`[sheet] matched: ${sheetMatched}, unmatched: ${sheetUnmatched}`)

  // 2. Fill in / override anyone in the fallback table that the sheet missed.
  let fallbackUsed = 0
  for (const { who, designation } of FALLBACK) {
    const person = fuzzyMatch(who, allEmps)
    if (!person) {
      console.log(`[fallback] no DB match for "${who}" — skipped`)
      continue
    }
    if (desired.has(person.id)) continue
    desired.set(person.id, designation)
    fallbackUsed++
  }
  console.log(`[fallback] applied to ${fallbackUsed} additional employees`)

  // 3. Apply.
  let updated = 0, unchanged = 0
  for (const [empId, newDesig] of desired.entries()) {
    const cur = allEmps.find((e) => e.id === empId)
    if (!cur) continue
    if ((cur.designation ?? '').trim() === newDesig.trim()) {
      unchanged++
      continue
    }
    console.log(`  ${cur.fullName}: "${cur.designation}" → "${newDesig}"`)
    await prisma.employee.update({
      where: { id: empId },
      data: { designation: newDesig },
    })
    updated++
  }

  console.log(`\n[result] updated:    ${updated}`)
  console.log(`[result] unchanged:  ${unchanged}`)
  console.log(`[result] total scope: ${desired.size}`)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

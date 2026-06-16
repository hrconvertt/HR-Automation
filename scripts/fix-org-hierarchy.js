/**
 * scripts/fix-org-hierarchy.js
 *
 * Rebuilds Employee.reportingManagerId across the company so the org chart
 * renders a real tree (and Iqra Naveed et al. stop floating as orphans
 * under the synthetic Convertt root).
 *
 * Strategy:
 *   1. Load the Employee_Master tab from the master sheet.
 *   2. For each row, try to match the "Reporting Manager" column to an
 *      existing Employee row using a fuzzy matcher (strips honorifics +
 *      uses token-overlap).
 *   3. If the sheet has no manager listed for a person, fall back to a
 *      hard-coded hierarchy (department heads → CEO, devs → leads, etc.).
 *   4. CEO + Co-Founder always end up with reportingManagerId = null.
 *
 * Idempotent — re-runs are no-ops once everyone is correct.
 * Prints summary: updated / unchanged / skipped (no manager listed) /
 * unmatched (manager name didn't resolve to any employee).
 *
 * Run locally with DATABASE_URL pointing at production:
 *   node scripts/fix-org-hierarchy.js
 */

const XLSX = require('xlsx')
const { PrismaClient } = require('@prisma/client')

const SHEET_PATH = String.raw`C:\Users\HRConvertt\Downloads\Master Sheet - Convertt_HR (2).xlsx`

// ─── Fuzzy name matcher ─────────────────────────────────────────────────────
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

    // Score = overlap count, but require at least 2 matching tokens for
    // multi-token queries to avoid e.g. "Ali" matching every Ali.
    let overlap = 0
    for (const t of qSet) if (eSet.has(t)) overlap++
    if (overlap === 0) continue

    // Bonus: exact substring of full names (case-insensitive) wins ties.
    const exact =
      e.fullName.toLowerCase().includes(query.trim().toLowerCase()) ||
      query.toLowerCase().includes(e.fullName.toLowerCase())
    const score = overlap * 10 + (exact ? 5 : 0) - Math.abs(eTokens.length - qTokens.length)

    if (score > bestScore) {
      bestScore = score
      best = e
    }
  }

  // For single-token queries require an exact token match
  // (otherwise "Ali" silently picks the first Ali in DB).
  if (qTokens.length === 1 && bestScore < 10) return null
  // For multi-token, require ≥ 2 overlapping tokens
  if (qTokens.length >= 2 && bestScore < 20) return null

  return best
}

// ─── Hard-coded fallback hierarchy ──────────────────────────────────────────
// Used when the master sheet has no "Reporting Manager" cell for someone.
// Names get fuzzy-matched too, so honorifics / minor spelling diffs are fine.
const FALLBACK = [
  // CEO + Co-Founder → null
  { who: 'Syed Asghar', mgr: null },
  { who: 'Syed Khawer', mgr: null },

  // Khawer's reports
  { who: 'Arslan', mgr: 'Syed Khawer' },
  { who: 'Islam', mgr: 'Syed Khawer' },

  // CEO direct reports — department heads + standalone seniors
  { who: 'Iqra Naveed', mgr: 'Syed Asghar' },
  { who: 'Tahreem Waheed', mgr: 'Syed Asghar' },
  { who: 'Syeda Manqbat Aelia', mgr: 'Syed Asghar' },
  { who: 'Abdullah Shafiq', mgr: 'Syed Asghar' },
  { who: 'Atta Ur Rehman', mgr: 'Syed Asghar' },
  { who: 'Aqib Aslam', mgr: 'Syed Asghar' },
  { who: 'Muhammad Waqas Fareed', mgr: 'Syed Asghar' },
  // Iqra heads BD + Marketing + Media Team — Sheikh Taha (Media) reports to her, not the CEO directly.
  { who: 'Sheikh Taha Adnan', mgr: 'Iqra Naveed' },

  // Iqra's reports
  { who: 'Muhammad Affan Waseem', mgr: 'Iqra Naveed' },
  { who: 'Momin Munir', mgr: 'Iqra Naveed' },

  // UI/UX team → Abdullah Shafiq
  { who: 'Altaf Yaseen', mgr: 'Abdullah Shafiq' },
  { who: 'Muhammad Usman Saeed', mgr: 'Abdullah Shafiq' },
  // Designers report to Altaf
  { who: 'Muhammad Ammar Younas', mgr: 'Altaf Yaseen' },
  { who: 'Ali Hassan', mgr: 'Altaf Yaseen' },
  { who: 'Umar Ameen', mgr: 'Altaf Yaseen' },
  { who: 'Zuhaa Jutt', mgr: 'Altaf Yaseen' },

  // Shopify Dev team → Atta Ur Rehman
  { who: 'Momna Waryam Khan', mgr: 'Atta Ur Rehman' },
  // Shopify devs + interns report to Momna
  { who: 'Muzaffar Jamil', mgr: 'Momna Waryam Khan' },
  { who: 'Muhammad Ahsan', mgr: 'Momna Waryam Khan' },
  { who: 'Ali Shan', mgr: 'Momna Waryam Khan' },
  { who: 'Muhammad Rayyan', mgr: 'Momna Waryam Khan' },
  { who: 'Muhammad Irfan', mgr: 'Momna Waryam Khan' },
  { who: 'Ayesha Akram', mgr: 'Momna Waryam Khan' },
  { who: 'Mahnoor Riaz', mgr: 'Momna Waryam Khan' },

  // Media Team → Sheikh Taha Adnan (senior of the team); Taha → Iqra (above)
  { who: 'Usman Ali', mgr: 'Sheikh Taha Adnan' },
  { who: 'Tayyab Hussain', mgr: 'Usman Ali' },
]

// Names that must always be top-of-hierarchy (forced null)
const TOP_LEVEL = ['Syed Asghar', 'Syed Khawer']

// Defensive stub data for known employees who occasionally vanish from the DB
// (import drift, manual deletes). If any of these are missing we recreate them
// with sensible defaults rather than letting the org chart silently lose them.
// `mgr` is matched against the (post-create) employee list; null = top of tree.
const REQUIRED_EMPLOYEES = [
  { fullName: 'Syed Asghar Hassan',           designation: 'Chief Executive Officer',                            department: 'Executive',          mgr: null },
  { fullName: 'Syed Khawer Iqbal',            designation: 'Co-Founder & Head of Administration',                department: 'Administration',     mgr: null },
  { fullName: 'Iqra Naveed',                  designation: 'Head of Business Development & Marketing',           department: 'Business Development', mgr: 'Syed Asghar' },
  { fullName: 'Tahreem Waheed',               designation: 'HR Associate',                                        department: 'Human Resources',    mgr: 'Syed Asghar' },
  { fullName: 'Syeda Manqbat Aelia',          designation: 'Finance Analyst',                                     department: 'Finance',            mgr: 'Syed Asghar' },
  { fullName: 'Abdullah Shafiq',              designation: 'Head of UI/UX Design',                                department: 'Design',             mgr: 'Syed Asghar' },
  { fullName: 'Atta Ur Rehman',               designation: 'Head of Client Servicing & Operations - Shopify',     department: 'Operations',         mgr: 'Syed Asghar' },
  { fullName: 'Aqib Aslam',                   designation: 'Senior WordPress Developer',                          department: 'Engineering',        mgr: 'Syed Asghar' },
  { fullName: 'Muhammad Waqas Fareed',        designation: 'Head of Client Servicing & Operations',               department: 'Operations',         mgr: 'Syed Asghar' },
  { fullName: 'Sheikh Taha Adnan',            designation: 'Senior Graphics & UI Designer',                       department: 'Media Team',         mgr: 'Iqra Naveed' },
  { fullName: 'Altaf Yaseen',                 designation: 'Associate UI/UX Designer',                            department: 'Design',             mgr: 'Abdullah Shafiq' },
  { fullName: 'Muhammad Usman Saeed',         designation: 'Associate UI/UX Designer',                            department: 'Design',             mgr: 'Abdullah Shafiq' },
  { fullName: 'Muhammad Ammar Younas',        designation: 'UI/UX Designer',                                      department: 'Design',             mgr: 'Altaf Yaseen' },
  { fullName: 'Ali Hassan',                   designation: 'UI/UX Designer',                                      department: 'Design',             mgr: 'Altaf Yaseen' },
  { fullName: 'Umar Ameen',                   designation: 'UI/UX Designer',                                      department: 'Design',             mgr: 'Altaf Yaseen' },
  { fullName: 'Zuhaa Jutt',                   designation: 'UI/UX Designer',                                      department: 'Design',             mgr: 'Altaf Yaseen' },
  { fullName: 'Momna Waryam Khan',            designation: 'Lead Senior Software Engineer',                       department: 'Engineering',        mgr: 'Atta Ur Rehman' },
  { fullName: 'Muzaffar Jamil',               designation: 'Shopify Developer',                                   department: 'Engineering',        mgr: 'Momna Waryam Khan' },
  { fullName: 'Muhammad Ahsan',               designation: 'Junior Shopify Developer',                            department: 'Engineering',        mgr: 'Momna Waryam Khan' },
  { fullName: 'Ali Shan',                     designation: 'WordPress Developer',                                 department: 'Engineering',        mgr: 'Momna Waryam Khan' },
  { fullName: 'Muhammad Rayyan',              designation: 'Junior Shopify Developer',                            department: 'Engineering',        mgr: 'Momna Waryam Khan' },
  { fullName: 'Muhammad Irfan',               designation: 'Junior Shopify Developer',                            department: 'Engineering',        mgr: 'Momna Waryam Khan' },
  { fullName: 'Ayesha Akram',                 designation: 'Backend Intern',                                      department: 'Engineering',        mgr: 'Momna Waryam Khan' },
  { fullName: 'Mahnoor Riaz',                 designation: 'Backend Intern',                                      department: 'Engineering',        mgr: 'Momna Waryam Khan' },
  { fullName: 'Usman Ali',                    designation: 'Senior Video Editor',                                 department: 'Media',              mgr: 'Sheikh Taha Adnan' },
  { fullName: 'Tayyab Hussain',               designation: 'Junior Video Editor',                                 department: 'Media',              mgr: 'Usman Ali' },
  { fullName: 'Momin Munir',                  designation: 'Marketing Associate',                                 department: 'Marketing',          mgr: 'Iqra Naveed' },
  { fullName: 'Arslan',                       designation: 'Office Boy',                                          department: 'Administration',     mgr: 'Syed Khawer' },
  { fullName: 'Islam',                        designation: 'Office Boy',                                          department: 'Administration',     mgr: 'Syed Khawer' },
]

function emailFromName(name) {
  const slug = String(name).toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join('.')
  return `${slug}@convertt.co`
}

function codeFromName(name) {
  const slug = String(name).toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .trim()
    .split(/\s+/)
    .map((t) => t[0])
    .join('')
    .toUpperCase()
  return `CON-${slug}-${Math.floor(Math.random() * 900 + 100)}`
}

// ─── Ensure required employees exist ───────────────────────────────────────
// Returns the (possibly-grown) list of all employees so the caller can
// continue with the hierarchy pass without an extra DB round-trip.
async function ensureRequiredEmployees(prisma, allEmps) {
  const summary = []
  for (const spec of REQUIRED_EMPLOYEES) {
    const existing = fuzzyMatch(spec.fullName, allEmps)
    if (existing) {
      summary.push(`${spec.fullName}: already existed`)
      continue
    }

    // Ensure department exists.
    let dept = await prisma.department.findFirst({ where: { name: spec.department } })
    if (!dept) {
      dept = await prisma.department.create({
        data: { name: spec.department, code: spec.department.slice(0, 3).toUpperCase() },
      })
    }

    const email = emailFromName(spec.fullName)
    // If a user with this email exists, drop the @-part so we can still create.
    const emailUnique = (await prisma.employee.findFirst({ where: { email } }))
      ? `${spec.fullName.toLowerCase().replace(/\s+/g, '.')}.${Date.now()}@convertt.co`
      : email

    const created = await prisma.employee.create({
      data: {
        employeeCode: codeFromName(spec.fullName),
        fullName: spec.fullName,
        email: emailUnique,
        joiningDate: new Date('2023-01-01'),
        designation: spec.designation,
        departmentId: dept.id,
        status: 'ACTIVE',
        employeeType: 'PERMANENT',
        workLocation: 'ONSITE',
      },
      select: { id: true, fullName: true, status: true, reportingManagerId: true, employeeCode: true },
    })
    allEmps.push(created)
    summary.push(`${spec.fullName}: CREATED (stub data — review in HR module)`)
  }

  console.log(`\n[required-employees] summary:`)
  for (const line of summary) {
    if (/iqra/i.test(line)) console.log(`  >>> ${line}`)
    else console.log(`  - ${line}`)
  }
  return allEmps
}

async function main() {
  const prisma = new PrismaClient()

  // Wake Neon (free tier may have suspended).
  for (let i = 1; i <= 10; i++) {
    try { await prisma.$queryRaw`SELECT 1`; break }
    catch (e) {
      if (i === 10) throw e
      console.log(`Waking Neon… ${i}/10`)
      await new Promise((r) => setTimeout(r, 4000))
    }
  }

  let allEmps = await prisma.employee.findMany({
    select: { id: true, fullName: true, status: true, reportingManagerId: true, employeeCode: true },
  })

  // ── Defensive: create any missing required employees first ──
  // Stops people like Iqra Naveed from silently vanishing if a future
  // import script accidentally deletes them.
  allEmps = await ensureRequiredEmployees(prisma, allEmps)

  const activeEmps = allEmps.filter((e) => e.status === 'ACTIVE')

  // ── Diagnostic up front ──
  const noMgrActive = activeEmps.filter((e) => !e.reportingManagerId)
  console.log(`\n[diagnostic] ${allEmps.length} total employees, ${activeEmps.length} ACTIVE`)
  console.log(`[diagnostic] ${noMgrActive.length} ACTIVE employees have NO reportingManagerId`)
  console.log(`[diagnostic] Sample orphans:`)
  for (const e of noMgrActive.slice(0, 15)) {
    console.log(`             - ${e.fullName} (${e.employeeCode})`)
  }

  const iqra = allEmps.find((e) => /iqra/i.test(e.fullName) && /naveed/i.test(e.fullName))
  if (iqra) {
    console.log(`[diagnostic] Iqra found: ${iqra.fullName} status=${iqra.status} mgr=${iqra.reportingManagerId ?? 'null'}`)
  } else {
    console.log(`[diagnostic] Iqra Naveed NOT FOUND in DB`)
  }

  // ── Load sheet ──
  let sheetRows = []
  try {
    const wb = XLSX.readFile(SHEET_PATH)
    const tab = wb.Sheets['Employee_Master']
    if (tab) sheetRows = XLSX.utils.sheet_to_json(tab, { defval: null })
    console.log(`\n[sheet] Loaded ${sheetRows.length} rows from Employee_Master`)
  } catch (e) {
    console.warn(`[sheet] Could not load ${SHEET_PATH}: ${e.message}`)
    console.warn(`[sheet] Falling back to hard-coded hierarchy only.`)
  }

  // ── Build (person → desired manager name) map ──
  // Sheet wins; hard-coded fills the gaps.
  const desired = new Map() // employeeId → managerId | null

  function setDesired(personRow, managerName) {
    if (!personRow) return
    if (TOP_LEVEL.some((n) => fuzzyMatch(n, [personRow]) === personRow)) {
      desired.set(personRow.id, null)
      return
    }
    if (!managerName) return
    const mgr = fuzzyMatch(managerName, allEmps)
    if (mgr && mgr.id !== personRow.id) {
      desired.set(personRow.id, mgr.id)
    }
  }

  let sheetMatched = 0
  let sheetSkipNoMgr = 0
  let sheetUnmatched = 0
  for (const r of sheetRows) {
    const name = r['Full Name']
    if (!name) continue
    const person = fuzzyMatch(name, allEmps)
    if (!person) {
      sheetUnmatched++
      continue
    }
    const mgrName = r['Reporting Manager']
    if (!mgrName || String(mgrName).trim() === '' || String(mgrName).trim() === '-') {
      sheetSkipNoMgr++
      // leave for fallback
    } else {
      const before = desired.get(person.id)
      setDesired(person, mgrName)
      if (desired.has(person.id) && desired.get(person.id) !== before) sheetMatched++
    }
  }

  // Apply fallback for anyone still unset
  let fallbackUsed = 0
  for (const { who, mgr } of FALLBACK) {
    const person = fuzzyMatch(who, allEmps)
    if (!person) continue
    if (desired.has(person.id)) continue // sheet already covered it
    if (mgr === null) {
      desired.set(person.id, null)
    } else {
      const m = fuzzyMatch(mgr, allEmps)
      if (m && m.id !== person.id) desired.set(person.id, m.id)
    }
    fallbackUsed++
  }

  // Force top-level
  for (const n of TOP_LEVEL) {
    const p = fuzzyMatch(n, allEmps)
    if (p) desired.set(p.id, null)
  }

  console.log(`\n[plan] sheet matched: ${sheetMatched}, sheet no-mgr: ${sheetSkipNoMgr}, sheet unmatched name: ${sheetUnmatched}`)
  console.log(`[plan] fallback hierarchy rules applied: ${fallbackUsed}`)
  console.log(`[plan] total assignments to verify: ${desired.size}`)

  // ── Apply ──
  let updated = 0, unchanged = 0
  for (const [empId, newMgrId] of desired.entries()) {
    const cur = allEmps.find((e) => e.id === empId)
    if (!cur) continue
    if ((cur.reportingManagerId ?? null) === (newMgrId ?? null)) {
      unchanged++
      continue
    }
    await prisma.employee.update({
      where: { id: empId },
      data: { reportingManagerId: newMgrId },
    })
    updated++
  }

  // Orphans = active employees with no desired entry AND no current manager
  const orphans = activeEmps.filter(
    (e) => !desired.has(e.id) && !e.reportingManagerId && !TOP_LEVEL.some((n) => fuzzyMatch(n, [e]) === e)
  )

  console.log(`\n[result] updated:    ${updated}`)
  console.log(`[result] unchanged:  ${unchanged}`)
  console.log(`[result] orphans:    ${orphans.length}`)
  for (const o of orphans) {
    console.log(`           - ${o.fullName} (${o.employeeCode}) — no rule matched, will float under root`)
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

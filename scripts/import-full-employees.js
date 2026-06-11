/**
 * scripts/import-full-employees.js
 * ─────────────────────────────────
 * One-shot, idempotent importer for the FULL Convertt HR roster + payroll history.
 *
 * Reads three xlsx files (defaults below; override via env vars):
 *   MASTER_SHEET_PATH  — Master Sheet with Employee_Master + Increments tabs
 *   IBFT_PATH_A        — Paid_IBFT Account Details (file 1)
 *   IBFT_PATH_B        — Paid_IBFT Account Details (file 2)
 *
 * For each employee in `Employee_Master`:
 *   1. Generates a NEW sequential employeeCode per department (CON-XXX-NNN).
 *      Old code is preserved on the legacyEmployeeCode field as a backup.
 *   2. Upserts the User account with bcrypt-hashed temp password 'Convertt2026!'.
 *      mustChangePass=true forces the user to change it on first login.
 *      Role auto-detected from designation/department:
 *         HR_ADMIN — Human Resources dept
 *         EXECUTIVE — CEO/CTO/CFO/Director-level titles
 *         MANAGER   — Lead / Head / Manager / Director in title
 *         EMPLOYEE  — everyone else (default)
 *   3. Creates/updates Salary + ProbationRecord.
 *   4. From the Increments tab (Payroll - Increments Performanc): walks each
 *      employee's row pair-wise across the 7 date columns and records a
 *      CompensationHistory entry every time the amount changes, capturing
 *      the "Notes" reason next to it.
 *   5. From both IBFT files (11 monthly tabs each), creates Payslip rows
 *      with the exact paid amount + IBAN account from the transfer record.
 *
 * Re-running this script is safe — matching is by email (primary) then
 * fullName fuzzy match. Existing rows are updated, not duplicated.
 *
 * Run locally with DATABASE_URL set:
 *   node scripts/import-full-employees.js
 */

const XLSX = require('xlsx')
const path = require('path')
const bcrypt = require('bcryptjs')
const { PrismaClient } = require('@prisma/client')

const MASTER_SHEET_PATH = process.env.MASTER_SHEET_PATH
  || String.raw`C:\Users\HRConvertt\Downloads\Master Sheet - Convertt_HR (2).xlsx`
const IBFT_PATH_A = process.env.IBFT_PATH_A
  || String.raw`C:\Users\HRConvertt\Downloads\Paid_IBFT Account Details_Jan 2026 (1).xlsx`
const IBFT_PATH_B = process.env.IBFT_PATH_B
  || String.raw`C:\Users\HRConvertt\Downloads\Paid_IBFT Account Details_Jan 2026 (2).xlsx`

const TEMP_PASSWORD = 'Convertt2026!'

// ─── helpers ─────────────────────────────────────────────────────────────────

function xlsxDate(serial) {
  if (serial == null || serial === '-' || serial === '') return null
  if (typeof serial === 'string') {
    // Some sheet rows have ISO/text dates
    const parsed = new Date(serial)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (typeof serial !== 'number') return null
  return new Date(Math.round((serial - 25569) * 86400 * 1000))
}

function trimStr(v) {
  if (v == null) return null
  const s = String(v).trim()
  return s.length === 0 ? null : s
}

function normalize(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function firstName(s) {
  return normalize(s).split(' ')[0] || ''
}

const STATUS_MAP = {
  Active: 'ACTIVE',
  'Active ': 'ACTIVE',
  Terminated: 'TERMINATED',
  Resigned: 'RESIGNED',
  'Resigned ': 'RESIGNED',
  'On Leave': 'ON_LEAVE',
}

const TYPE_MAP = {
  Permanent: 'PERMANENT',
  Probation: 'PROBATION',
  Internship: 'INTERNSHIP',
  Training: 'TRAINING',
}

// Sheet dept name → DB dept code
const DEPT_TO_CODE = {
  'Business Development & Marketing': 'BD',
  'Business Development': 'BD',
  'Web - Shopify': 'WBS',
  'Shopify': 'WBS',
  'Finance': 'FIN',
  'Human Resource': 'HR',
  'Human Resources': 'HR',
  'HR': 'HR',
  'Media Team': 'MDT',
  'Media': 'MDT',
  'UIUX': 'UIUX',
  'UI/UX': 'UIUX',
  'Web - WordPress': 'WBW',
  'WordPress': 'WBW',
  'Admin': 'ADM',
  'Marketing': 'MRK',
  'Production': 'PCD',
  'CTO': 'CTO',
}

// New depts created on the fly: code → display name (used if not in DB)
const DEPT_DISPLAY_NAME = {
  BD: 'Business Development & Marketing',
  WBS: 'Web — Shopify',
  WBW: 'Web — WordPress',
  FIN: 'Finance',
  HR: 'Human Resources',
  MDT: 'Media Team',
  UIUX: 'UI/UX',
  ADM: 'Admin',
  MRK: 'Marketing',
  PCD: 'Production',
  CTO: 'CTO',
  GEN: 'General',
}

function deptCode(raw) {
  if (!raw) return 'GEN'
  const k = String(raw).trim()
  return DEPT_TO_CODE[k] ?? DEPT_TO_CODE[k.replace(/\s+$/, '')] ?? 'GEN'
}

// Designation → role mapping
function detectRoles(designation, deptCodeStr) {
  const d = (designation || '').toLowerCase()
  const isHR = deptCodeStr === 'HR'
  const isExec = /\b(ceo|cto|cfo|coo|cxo)\b/.test(d)
    || /chief\s+\w+\s+officer/.test(d)
  const isMgr = /\b(lead|head|manager|director)\b/.test(d)

  const roles = new Set()
  roles.add('EMPLOYEE')
  if (isMgr) roles.add('MANAGER')
  if (isExec) roles.add('EXECUTIVE')
  if (isHR) roles.add('HR_ADMIN')

  let primary = 'EMPLOYEE'
  if (isHR) primary = 'HR_ADMIN'
  else if (isExec) primary = 'EXECUTIVE'
  else if (isMgr) primary = 'MANAGER'
  return { primary, all: Array.from(roles) }
}

// IBFT tab name → {month, year}. Year is inferred from tab name + file's
// known span (Aug-25 to Jun-26 across 11 monthly tabs).
function ibftTabToMonth(tabName) {
  const m = tabName.toLowerCase()
  // Look for explicit year first
  let year = null
  const yearMatch = m.match(/\b(\d{2,4})\b/)
  if (yearMatch) {
    const y = parseInt(yearMatch[1])
    year = y < 100 ? 2000 + y : y
  }
  if (m.includes('aug')) return { month: 8, year: year ?? 2025 }
  if (m.includes('sep')) return { month: 9, year: year ?? 2025 }
  if (m.includes('oct')) return { month: 10, year: year ?? 2025 }
  if (m.includes('nov')) return { month: 11, year: year ?? 2025 }
  if (m.includes('dec')) return { month: 12, year: year ?? 2025 }
  if (m.includes('jan')) return { month: 1, year: year ?? 2026 }
  if (m.includes('feb')) return { month: 2, year: year ?? 2026 }
  if (m.includes('mar')) return { month: 3, year: year ?? 2026 }
  if (m.includes('apr')) return { month: 4, year: year ?? 2026 }
  if (m.includes('may')) return { month: 5, year: year ?? 2026 }
  if (m.includes('jun')) return { month: 6, year: year ?? 2026 }
  return null
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const prisma = new PrismaClient()

  // Wake Neon (10× 4s retries)
  for (let i = 1; i <= 10; i++) {
    try { await prisma.$queryRaw`SELECT 1`; break }
    catch (e) {
      if (i === 10) throw e
      console.log(`Waking Neon… attempt ${i}/10`)
      await new Promise((r) => setTimeout(r, 4000))
    }
  }

  console.log('Reading workbooks…')
  const masterWb = XLSX.readFile(MASTER_SHEET_PATH)
  const ibftA = XLSX.readFile(IBFT_PATH_A)
  const ibftB = XLSX.readFile(IBFT_PATH_B)

  const empRows = XLSX.utils.sheet_to_json(
    masterWb.Sheets['Employee_Master'],
    { defval: null }
  )
  console.log(`Employee_Master: ${empRows.length} rows`)

  // ─── Resolve / create departments ─────────────────────────────────────
  let depts = await prisma.department.findMany({
    select: { id: true, code: true, name: true },
  })
  const deptIdByCode = new Map(depts.map((d) => [d.code, d.id]))

  async function ensureDept(code) {
    if (deptIdByCode.has(code)) return deptIdByCode.get(code)
    const created = await prisma.department.create({
      data: { code, name: DEPT_DISPLAY_NAME[code] ?? code },
    })
    deptIdByCode.set(code, created.id)
    return created.id
  }

  // ─── Next-sequence per dept ───────────────────────────────────────────
  // Find max existing CON-XXX-NNN per department code across all employees
  const allEmps = await prisma.employee.findMany({
    select: { id: true, employeeCode: true, fullName: true, email: true, legacyEmployeeCode: true },
  })
  const seqByDept = new Map() // code → highest NNN seen
  for (const e of allEmps) {
    const m = (e.employeeCode || '').match(/^CON-([A-Z]+)-(\d+)$/)
    if (m) {
      const code = m[1]
      const num = parseInt(m[2], 10)
      if (!seqByDept.has(code) || seqByDept.get(code) < num) {
        seqByDept.set(code, num)
      }
    }
  }
  function nextCode(code) {
    const n = (seqByDept.get(code) || 0) + 1
    seqByDept.set(code, n)
    return `CON-${code}-${String(n).padStart(3, '0')}`
  }

  // ─── Build email-and-name lookup for idempotency ──────────────────────
  const empByEmail = new Map(allEmps.filter((e) => e.email).map((e) => [e.email.toLowerCase(), e]))
  const empByLegacy = new Map(allEmps.filter((e) => e.legacyEmployeeCode).map((e) => [e.legacyEmployeeCode, e]))
  const empByNorm = new Map(allEmps.map((e) => [normalize(e.fullName), e]))

  // Resolve reporting-manager name → employee id; built lazily
  function resolveManagerId(name) {
    if (!name) return null
    return empByNorm.get(normalize(name))?.id ?? null
  }

  // ─── Pass 1: upsert employees + users ─────────────────────────────────
  let created = 0, updated = 0, skipped = 0
  const issues = []
  const empIdByOldCode = new Map()
  const empIdByNorm = new Map(empByNorm) // mutable copy
  // Need an HR user id to use as approvedById on compensation/payslips later
  let hrUserId = null

  for (const r of empRows) {
    const oldCode = trimStr(r['Employee Code'])
    const fullName = trimStr(r['Full Name'])
    const email = trimStr(r['Email'])

    if (!fullName || !email) { skipped++; continue }

    const sheetStatus = STATUS_MAP[(r['Status'] || '').toString()] ?? 'ACTIVE'
    const empType = TYPE_MAP[(r['Employee Type'] || '').toString()] ?? 'PROBATION'
    const dCode = deptCode(r['Department'])
    const departmentId = await ensureDept(dCode)

    const designation = trimStr(r['Current Designation']) || 'Staff'
    const hiringDesignation = trimStr(r['Hiring Designation'])
    const workLocation = trimStr(r['Work Location']) || 'ONSITE'
    const timings = trimStr(r['Timings (Range)']) || trimStr(r['Timings - Standard Hours'])
    const cnic = trimStr(r['CNIC'])
    const phone = trimStr(r['Phone'])
    const homeAddr = trimStr(r['Current Home_ADDRESS'])
    const permAddr = trimStr(r['Permanent address'])
    const dob = xlsxDate(r['DOB'])
    const joiningDate = xlsxDate(r['Joining Date']) || new Date()
    const termDate = xlsxDate(r['Termination Date'])
    const probStart = xlsxDate(r['Probation Period\nStart Date'])
    const probEnd = xlsxDate(r['Probation Period\nEnd Date'])
    const trainingDuration = trimStr(r['Training Period Duration'])

    // Salary fields — preserve exact amounts
    const salaryPkg = Number(r['Salary Pkg (Decided in Interview)']) || 0
    const duringProbation = Number(r['During Probation']) || 0
    const afterProbation = Number(r['After Probation 10%']) || 0
    const currentSalary = Number(r['Current Salary']) || 0

    // Pick best monthly gross:
    //   PERMANENT — currentSalary || afterProbation || salaryPkg
    //   PROBATION — duringProbation || salaryPkg
    //   other     — salaryPkg
    const monthlyGross =
      empType === 'PERMANENT' ? (currentSalary || afterProbation || salaryPkg)
        : empType === 'PROBATION' ? (duringProbation || salaryPkg)
        : (currentSalary || salaryPkg)

    const { primary: primaryRole, all: roleList } = detectRoles(designation, dCode)

    const hashed = await bcrypt.hash(TEMP_PASSWORD, 12)
    const isActive = sheetStatus === 'ACTIVE'

    // Find existing record (by email first, then legacy code, then fullName)
    let existing = empByEmail.get(email.toLowerCase())
      || (oldCode ? empByLegacy.get(oldCode) : null)
      || empByNorm.get(normalize(fullName))

    // For new employees, mint a new sequential employee code per dept
    const empCode = existing ? existing.employeeCode : nextCode(dCode)

    try {
      const result = await prisma.$transaction(async (tx) => {
        // ── Upsert user ──
        let user = await tx.user.findUnique({ where: { email: email.toLowerCase() } })
        if (!user) {
          user = await tx.user.create({
            data: {
              email: email.toLowerCase(),
              password: hashed,
              role: primaryRole,
              mustChangePass: true,
              isActive,
              userRoles: { create: roleList.map((role) => ({ role })) },
            },
          })
        } else {
          await tx.user.update({
            where: { id: user.id },
            data: {
              isActive,
              role: primaryRole,
              // Don't overwrite password on re-run if user already changed it
              // (mustChangePass=false signals they own it now).
              ...(user.mustChangePass ? { password: hashed } : {}),
            },
          })
          // Ensure all detected roles exist
          for (const r of roleList) {
            await tx.userRole.upsert({
              where: { userId_role: { userId: user.id, role: r } },
              update: {},
              create: { userId: user.id, role: r },
            })
          }
        }

        // ── Upsert employee ──
        const empData = {
          fullName,
          email,
          designation,
          hiringDesignation,
          phone,
          cnic,
          dob,
          address: homeAddr,
          temporaryAddress: permAddr,
          joiningDate,
          employeeType: empType,
          status: sheetStatus,
          workLocation: workLocation.toUpperCase().includes('REMOTE') ? 'WFH'
            : workLocation.toUpperCase().includes('HYBRID') ? 'HYBRID'
            : 'ONSITE',
          timings,
          departmentId,
          ...(termDate ? { exitDate: termDate } : {}),
          ...(oldCode ? { legacyEmployeeCode: oldCode } : {}),
        }

        let emp
        if (existing) {
          emp = await tx.employee.update({
            where: { id: existing.id },
            data: { ...empData, userId: user.id },
          })
        } else {
          emp = await tx.employee.create({
            data: { ...empData, employeeCode: empCode, userId: user.id },
          })
        }

        // ── Salary ──
        if (monthlyGross > 0) {
          const basic = Math.round(monthlyGross * 0.6)
          const houseRent = Math.round(monthlyGross * 0.3)
          const other = Math.round(monthlyGross * 0.1)
          await tx.salary.upsert({
            where: { employeeId: emp.id },
            update: { basic, houseRent, otherAllowance: other, effectiveFrom: joiningDate },
            create: {
              employeeId: emp.id,
              basic, houseRent, otherAllowance: other,
              effectiveFrom: joiningDate,
            },
          })
        }

        // ── Probation ──
        if (probStart && probEnd) {
          let months = 3
          if (trainingDuration) {
            const m = String(trainingDuration).match(/(\d+)/)
            if (m) months = parseInt(m[1], 10) || 3
          }
          await tx.probationRecord.upsert({
            where: { employeeId: emp.id },
            update: { startDate: probStart, endDate: probEnd, durationMonths: months },
            create: {
              employeeId: emp.id,
              startDate: probStart,
              endDate: probEnd,
              durationMonths: months,
            },
          })
        }

        // ── Onboarding shell ──
        await tx.onboardingChecklist.upsert({
          where: { employeeId: emp.id },
          update: {},
          create: { employeeId: emp.id },
        })

        return { emp, user }
      }, { timeout: 60000 })

      if (existing) updated++; else created++
      empIdByOldCode.set(oldCode, result.emp.id)
      empIdByNorm.set(normalize(fullName), { id: result.emp.id, fullName, email })
      empByEmail.set(email.toLowerCase(), { id: result.emp.id, fullName, email, employeeCode: empCode })

      // Capture first HR_ADMIN user id for downstream approvals
      if (!hrUserId && roleList.includes('HR_ADMIN')) {
        hrUserId = result.user.id
      }
    } catch (e) {
      issues.push(`${fullName} (${email}): ${e.message}`)
      skipped++
    }
  }

  // ─── Pass 2: reporting manager links ──────────────────────────────────
  let mgrLinked = 0
  for (const r of empRows) {
    const email = trimStr(r['Email'])
    if (!email) continue
    const mgrName = trimStr(r['Reporting Manager'])
    if (!mgrName) continue
    const employee = empByEmail.get(email.toLowerCase())
    const managerId = resolveManagerId(mgrName)
      ?? empIdByNorm.get(normalize(mgrName))?.id
    if (!employee || !managerId || employee.id === managerId) continue
    try {
      await prisma.employee.update({
        where: { id: employee.id },
        data: { reportingManagerId: managerId },
      })
      mgrLinked++
    } catch { /* ignore — manager may be self */ }
  }

  // ─── Build shared fuzzy matcher (used by Pass 3 AND Pass 4) ───
  // Strips honorific prefixes from BOTH sides then scores by token overlap.
  // Handles "Abdllah Shafiq" (typo) → "Abdullah Shafiq", "Taha Adnan" →
  // "Sheikh Taha Adnan", etc.
  const HONORIFICS = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'sir', 'madam',
    'muhammad', 'mohammad', 'mohd', 'syed', 'syeda', 'sheikh', 'sh',
    'ch', 'chaudhry', 'mr.', 'mrs.', 'hafiz', 'haji', 'malik', 'rana'])
  function meaningfulTokens(name) {
    return normalize(name)
      .split(' ')
      .map(t => t.replace(/[^a-z0-9]/g, ''))
      .filter(t => t.length >= 2 && !HONORIFICS.has(t))
  }
  const empTokens = []
  // Refresh employee list to include the ones just created in Pass 1
  const allEmpsForMatch = await prisma.employee.findMany({
    select: { id: true, fullName: true, employeeCode: true, joiningDate: true },
  })
  for (const e of allEmpsForMatch) {
    empTokens.push({
      id: e.id,
      name: e.fullName,
      joiningDate: e.joiningDate,
      tokens: new Set(meaningfulTokens(e.fullName)),
    })
  }
  function matchEmployee(rawName) {
    const wanted = meaningfulTokens(rawName)
    if (!wanted.length) return null
    let best = null, bestScore = 0
    for (const c of empTokens) {
      let score = 0
      for (const w of wanted) if (c.tokens.has(w)) score++
      if (score > bestScore) { bestScore = score; best = c }
    }
    return bestScore >= 1 ? best : null
  }

  // ─── Backfill "Hired at PKR X" baseline for everyone with a Salary ───
  // Ensures every employee has at least one row in Compensation Timeline,
  // even if they never had an increment.
  console.log('Backfilling hire-baseline compensation history…')
  let hireBaselines = 0
  const empsWithSalary = await prisma.employee.findMany({
    where: { salary: { isNot: null } },
    include: { salary: true, compensationHistory: { take: 1 } },
  })
  for (const emp of empsWithSalary) {
    if (emp.compensationHistory.length > 0) continue // already has entries
    if (!emp.salary) continue
    const monthlyGross = emp.salary.basic + emp.salary.houseRent + emp.salary.medicalAllowance
      + emp.salary.fuel + emp.salary.food + emp.salary.utilities + emp.salary.otherAllowance
    if (monthlyGross <= 0) continue
    try {
      await prisma.compensationHistory.create({
        data: {
          employeeId: emp.id,
          type: 'HIRE',
          oldSalary: 0,
          newSalary: monthlyGross,
          incrementPct: null,
          reason: 'Hired — joining offer',
          effectiveDate: emp.joiningDate ?? new Date(),
          approvedById: hrUserId,
        },
      })
      hireBaselines++
    } catch { /* ignore */ }
  }

  // ─── Pass 3: Compensation history from Increments tab ─────────────────
  console.log('Building compensation history…')
  let compHistoryCreated = 0
  const incRows = XLSX.utils.sheet_to_json(
    masterWb.Sheets['Payroll - Increments Performanc'],
    { defval: null, header: 1 }
  )
  // Row 3 has the date headers; find the date columns
  const headerRow = incRows[3] || []
  // Build [{dateCol, notesCol, date}] sorted by dateCol asc
  const cols = []
  for (let i = 1; i < headerRow.length; i++) {
    const cell = headerRow[i]
    if (typeof cell === 'number') {
      // The next column is "Notes"
      cols.push({ dateCol: i, notesCol: i + 1, date: xlsxDate(cell) })
    }
  }

  // Walk each data row (rows 4..end)
  for (let r = 4; r < incRows.length; r++) {
    const row = incRows[r]
    if (!row || !row[0]) continue
    const name = trimStr(row[0])
    if (!name) continue
    // Use the fuzzy matcher (handles "Abdllah Shafiq" typo, short names like "Affan", etc.)
    const empRef = matchEmployee(name)
      || empIdByNorm.get(normalize(name))
      || empByNorm.get(normalize(name))
    if (!empRef) continue

    let prevAmount = null
    let prevDate = null
    for (const c of cols) {
      const amount = Number(row[c.dateCol]) || 0
      const reason = trimStr(row[c.notesCol])
      if (amount > 0) {
        if (prevAmount != null && amount !== prevAmount) {
          // Salary changed at c.date — record it
          try {
            // Idempotency: skip if a CompensationHistory for this date+emp already exists
            const exists = await prisma.compensationHistory.findFirst({
              where: {
                employeeId: empRef.id,
                effectiveDate: c.date,
                newSalary: amount,
              },
            })
            if (!exists) {
              const incPct = prevAmount > 0
                ? Math.round(((amount - prevAmount) / prevAmount) * 1000) / 10
                : null
              const type = (reason || '').toLowerCase().includes('promotion') ? 'PROMOTION'
                : (reason || '').toLowerCase().includes('bonus') ? 'BONUS'
                : 'INCREMENT'
              await prisma.compensationHistory.create({
                data: {
                  employeeId: empRef.id,
                  type,
                  oldSalary: prevAmount,
                  newSalary: amount,
                  incrementPct: incPct,
                  reason: reason || 'Salary revision',
                  effectiveDate: c.date || new Date(),
                  approvedById: hrUserId,
                },
              })
              compHistoryCreated++
            }
          } catch { /* skip duplicates */ }
        }
        prevAmount = amount
        prevDate = c.date
      }
    }
  }

  // ─── Pass 4: Payslip history from IBFT sheets ─────────────────────────
  console.log('Building payslip history from IBFT tabs…')
  let payslipsCreated = 0
  let payslipsSkipped = 0
  const unmatchedNames = new Map() // for diagnostics
  const ibftWorkbooks = [ibftA, ibftB]

  // Note: matchEmployee + HONORIFICS + meaningfulTokens defined above (before Pass 3)
  // and reused here.

  for (const wb of ibftWorkbooks) {
    for (const tabName of wb.SheetNames) {
      const monthInfo = ibftTabToMonth(tabName)
      if (!monthInfo) continue
      const { month, year } = monthInfo
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[tabName], { defval: null, header: 1 })
      // Header is row 0. Data starts after that (row 1 is sometimes blank).
      const header = (rows[0] || []).map((h) => String(h || '').toLowerCase())
      const idxName = header.findIndex((h) => h.includes('name'))
      const idxAcct = header.findIndex((h) => h.includes('account'))
      const idxBank = header.findIndex((h) => h === 'bank')
      const idxAmount = header.findIndex((h) => h.includes('amount'))
      const idxRef = header.findIndex((h) => h.includes('reference'))
      if (idxName === -1 || idxAmount === -1) continue

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i] || []
        const name = trimStr(row[idxName])
        const amount = Number(row[idxAmount]) || 0
        if (!name || !amount) continue
        const iban = idxAcct >= 0 ? trimStr(row[idxAcct]) : null
        const bank = idxBank >= 0 ? trimStr(row[idxBank]) : null
        const ref = idxRef >= 0 ? trimStr(row[idxRef]) : null

        // Robust token-overlap match (handles "Taha" vs "Sheikh Taha Adnan")
        const match = matchEmployee(name)
        if (!match) {
          unmatchedNames.set(name, (unmatchedNames.get(name) || 0) + 1)
          payslipsSkipped++
          continue
        }

        // Persist IBAN + bank on Employee (first time we see them)
        if (iban || bank) {
          try {
            await prisma.employee.update({
              where: { id: match.id },
              data: {
                ...(iban ? { ibanAccount: iban, bankAccount: iban } : {}),
                ...(bank ? { bankName: bank } : {}),
              },
            })
          } catch { /* ignore */ }
        }

        // Create Payslip with split approximations
        const basic = Math.round(amount * 0.6)
        const houseRent = Math.round(amount * 0.3)
        const other = amount - basic - houseRent
        const releasedAt = new Date(Date.UTC(month === 12 ? year + 1 : year, month % 12, 1))
        try {
          await prisma.payslip.upsert({
            where: { employeeId_month_year: { employeeId: match.id, month, year } },
            update: {
              basic, houseRent, otherAllowance: other,
              grossSalary: amount, netSalary: amount,
              status: 'APPROVED', sentAt: releasedAt,
              adjustmentNote: ref || null,
            },
            create: {
              employeeId: match.id,
              month, year,
              basic, houseRent, otherAllowance: other,
              grossSalary: amount, netSalary: amount,
              workingDays: 22, presentDays: 22, leaveDays: 0, absentDays: 0,
              status: 'APPROVED',
              sentAt: releasedAt,
              adjustmentNote: ref || null,
            },
          })
          payslipsCreated++
        } catch {
          payslipsSkipped++
        }
      }
    }
  }

  // ─── Summary ──────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60))
  console.log('IMPORT SUMMARY')
  console.log('═'.repeat(60))
  console.log(JSON.stringify({
    created,
    updated,
    mgrLinked,
    hireBaselines,
    compHistoryCreated,
    payslipsCreated,
    payslipsSkipped,
    skipped,
    issuesCount: issues.length,
  }, null, 2))
  if (issues.length > 0) {
    console.log('\nFirst 10 issues:')
    for (const it of issues.slice(0, 10)) console.log(' •', it)
  }
  if (unmatchedNames && unmatchedNames.size > 0) {
    console.log('\nUnmatched IBFT names (couldn\'t link to any employee):')
    const sorted = [...unmatchedNames.entries()].sort((a,b) => b[1] - a[1])
    for (const [name, count] of sorted.slice(0, 20)) {
      console.log(`  • "${name}" — appeared ${count}x`)
    }
    if (sorted.length > 20) console.log(`  ... and ${sorted.length - 20} more`)
  }
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })

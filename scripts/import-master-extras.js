/**
 * Imports the four "extra" sheets the user opted into:
 *   • Master Sheet of Company Policie  → PolicyDocument
 *   • Position                          → Position (catalog)
 *   • Leave Policy                      → LeavePolicy (annual entitlement)
 *   • Probation Tracker                 → ProbationRecord (rating, outcome)
 *
 * Idempotent — re-runs safely.
 */
const XLSX = require('xlsx')
const { PrismaClient } = require('@prisma/client')

const SHEET_PATH = String.raw`C:\Users\HRConvertt\Downloads\Master Sheet - Convertt_HR (1).xlsx`

function xlsxDate(serial) {
  if (serial == null || serial === '-' || serial === '' || typeof serial !== 'number') return null
  return new Date(Math.round((serial - 25569) * 86400 * 1000))
}

// Sheet "Approved" label → app status.
function policyStatus(approved) {
  const s = (approved || '').toString().trim().toLowerCase()
  if (s === 'approved') return 'PUBLISHED'
  if (s === 'archived') return 'ARCHIVED'
  return 'DRAFT'
}

// Best-effort category derivation from the policy title.
function policyCategory(title) {
  const t = (title || '').toLowerCase()
  if (t.includes('leave')) return 'LEAVE'
  if (t.includes('code') || t.includes('harass') || t.includes('conduct') || t.includes('nda') || t.includes('confiden')) return 'CODE_OF_CONDUCT'
  if (t.includes('it ') || t.includes('cyber') || t.includes('data')) return 'IT'
  if (t.includes('security')) return 'SECURITY'
  if (t.includes('compensation') || t.includes('salary') || t.includes('overtime') || t.includes('payroll')) return 'COMPENSATION'
  return 'GENERAL'
}

async function importPolicies(prisma, wb) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Master Sheet of Company Policie'], { defval: null })
  let created = 0, updated = 0, skipped = 0
  for (const r of rows) {
    const title = (r['Policies'] || '').toString().trim()
    if (!title) { skipped++; continue }
    const status = policyStatus(r['Approved'])
    const category = policyCategory(title)
    const link = r['Links'] ? String(r['Links']).trim() : null
    const notes = r['Notes'] ? String(r['Notes']).trim() : null

    const existing = await prisma.policyDocument.findFirst({ where: { title } })
    const data = {
      title,
      category,
      type: category === 'CODE_OF_CONDUCT' ? 'CODE_OF_CONDUCT'
          : category === 'LEAVE' ? 'LEAVE_POLICY'
          : 'HR_POLICY',
      status,
      description: notes,
      url: link,
      audience: 'ALL',
      version: '1.0',
    }
    if (existing) {
      await prisma.policyDocument.update({ where: { id: existing.id }, data })
      updated++
    } else {
      await prisma.policyDocument.create({ data })
      created++
    }
  }
  return { created, updated, skipped }
}

async function importPositions(prisma, wb) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Position'], { defval: null })
  let created = 0, updated = 0, skipped = 0
  for (const r of rows) {
    const title = (r['Position Title'] || '').toString().trim()
    if (!title || title.toLowerCase() === 'position title') { skipped++; continue }
    const level = (r['Level'] || 'L1').toString().trim().toUpperCase()
    // Position has no @@unique — dedupe by (title, level) ourselves.
    const existing = await prisma.position.findFirst({ where: { title, level } })
    if (existing) {
      await prisma.position.update({ where: { id: existing.id }, data: { title, level } })
      updated++
    } else {
      await prisma.position.create({ data: { title, level } })
      created++
    }
  }
  return { created, updated, skipped }
}

async function importLeavePolicy(prisma, wb) {
  // The sheet is a matrix — rows are attributes ("Period", "Leaves Allowed",
  // "Total Leaves Allowed", "Notes", "WFH", "Overtime Policy"), columns are
  // employee types (Internship / Probation / Permanent Full-time).
  // We only care about "Total Leaves Allowed" for the entitlement matrix.
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Leave Policy'], { defval: null })
  const totalRow = rows.find((r) => String(r['Type'] || '').toLowerCase().includes('total leaves'))
  if (!totalRow) return { created: 0, updated: 0, skipped: 'no Total Leaves Allowed row' }

  // Extract numeric days per employeeType
  const parseDays = (v) => {
    if (typeof v === 'number') return v
    if (!v) return 0
    const m = String(v).match(/\d+/)
    return m ? Number(m[0]) : 0
  }
  const matrix = {
    INTERNSHIP:  parseDays(totalRow['Internship']),
    PROBATION:   parseDays(totalRow['Probation']),
    PERMANENT:   parseDays(totalRow['Permanent Full-time']),
  }

  // Split the total into CASUAL/SICK/ANNUAL the way the app already expects.
  // Convention from existing seed: Permanent → CASUAL=12, SICK=10, ANNUAL=2.
  // For now, fold the full sheet number into ANNUAL only and keep existing
  // CASUAL/SICK rows untouched so balances don't break.
  let created = 0, updated = 0
  for (const [type, days] of Object.entries(matrix)) {
    if (days <= 0) continue
    const existing = await prisma.leavePolicy.findUnique({
      where: { employeeType_leaveType: { employeeType: type, leaveType: 'ANNUAL' } },
    })
    if (existing) {
      await prisma.leavePolicy.update({ where: { id: existing.id }, data: { daysPerYear: days } })
      updated++
    } else {
      await prisma.leavePolicy.create({ data: { employeeType: type, leaveType: 'ANNUAL', daysPerYear: days } })
      created++
    }
  }
  return { created, updated, matrix }
}

async function importProbationTracker(prisma, wb) {
  // The sheet has a banner + section headers + label row before the data.
  // Use raw 2-D parsing to skip those rows reliably.
  const raw = XLSX.utils.sheet_to_json(wb.Sheets['Probation Tracker'], { header: 1, defval: null })
  // The label row is the one whose first cell === "Employee ID"
  const labelRowIdx = raw.findIndex((row) => row[0] === 'Employee ID')
  if (labelRowIdx === -1) return { created: 0, updated: 0, skipped: 'no header row' }

  const dataRows = raw.slice(labelRowIdx + 1)
  // Indices match the label row: 0=ID, 8=Probation Start, 9=Probation End,
  // 14=Rating (1-5), 15=Manager Comments, 16=Recommended Action,
  // 18=Confirmation Date (last data column is 19=Email Sent — no Status col)
  const ACTION_MAP = {
    'Confirm Permanent': 'CONFIRMED',
    'Confirmed': 'CONFIRMED',
    'Extend': 'EXTENDED',
    'Terminate': 'TERMINATED',
  }

  let created = 0, updated = 0, skipped = 0
  for (const row of dataRows) {
    const code = row[0]
    if (!code || typeof code !== 'string' || !code.startsWith('CON-')) { skipped++; continue }
    const emp = await prisma.employee.findUnique({ where: { employeeCode: code } })
    if (!emp) { skipped++; continue }

    const startDate = xlsxDate(row[8])
    const endDate = xlsxDate(row[9])
    if (!startDate || !endDate) { skipped++; continue }
    const rating = typeof row[14] === 'number' ? row[14] : null
    const comments = row[15] ? String(row[15]).trim() : null
    const outcome = ACTION_MAP[row[16]] ?? null
    const confirmationDate = xlsxDate(row[18])

    const data = {
      startDate,
      endDate,
      performanceRating: rating,
      managerNotes: comments,
      outcome,
      outcomeDate: confirmationDate,
    }
    const existing = await prisma.probationRecord.findUnique({ where: { employeeId: emp.id } })
    if (existing) {
      await prisma.probationRecord.update({ where: { id: existing.id }, data })
      updated++
    } else {
      await prisma.probationRecord.create({ data: { ...data, employeeId: emp.id } })
      created++
    }
    // Mirror confirmation onto the Employee row so it shows in profile.
    if (confirmationDate) {
      await prisma.employee.update({ where: { id: emp.id }, data: { confirmationDate } })
    }
  }
  return { created, updated, skipped }
}

async function main() {
  const prisma = new PrismaClient()
  const wb = XLSX.readFile(SHEET_PATH)
  const out = {}
  out.policies = await importPolicies(prisma, wb)
  out.positions = await importPositions(prisma, wb)
  out.leavePolicy = await importLeavePolicy(prisma, wb)
  out.probationTracker = await importProbationTracker(prisma, wb)
  console.log(JSON.stringify(out, null, 2))
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })

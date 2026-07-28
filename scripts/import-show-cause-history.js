/**
 * scripts/import-show-cause-history.js
 * ─────────────────────────────────────
 * Reads the "Performance Review - Show Cause" sheet from the master xlsx
 * and creates ShowCause records mapped to current Employee rows via the
 * existing fuzzy name matcher (strips honorifics + token overlap).
 *
 * Master sheet columns:
 *   Date | Candidate Name | Performance Issue(s) | Discussion Points |
 *   Employee Response | Action Plan and Improvement Steps | Deadline |
 *   Follow-up Date | Notes/Remarks | How many SC issued
 *
 * Idempotent on (employeeId, issueDate) — re-running skips duplicates.
 *
 * Run with DATABASE_URL set:
 *   node scripts/import-show-cause-history.js
 */

const XLSX = require('xlsx')
const { PrismaClient } = require('@prisma/client')

const XLSX_PATH = process.env.MASTER_PATH
  || String.raw`C:\Users\HRConvertt\Downloads\Master Sheet - Convertt_HR (2).xlsx`
const SHEET_NAME = 'Performance Review - Show Cause'

// ─── Fuzzy name matcher (reused from import-attendance.js) ───
const HONORIFICS = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'sir', 'madam',
  'muhammad', 'mohammad', 'mohd', 'syed', 'syeda', 'sheikh', 'sh',
  'ch', 'chaudhry', 'mr.', 'mrs.', 'hafiz', 'haji', 'malik', 'rana'])

function meaningfulTokens(name) {
  return String(name).toLowerCase().trim().split(/\s+/)
    .map(t => t.replace(/[^a-z0-9]/g, ''))
    .filter(t => t.length >= 2 && !HONORIFICS.has(t))
}

function xlsxDate(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') {
    return new Date(Math.round((v - 25569) * 86400 * 1000))
  }
  if (v instanceof Date) return v
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Parse a deadline cell — can be:
 *   "3 days" / "7 days"           → offset from issueDate
 *   an absolute date / xlsx serial → use as-is
 */
function parseDeadline(cell, issueDate) {
  if (cell == null || cell === '') return null
  if (typeof cell === 'number') return xlsxDate(cell)
  const s = String(cell).trim().toLowerCase()
  const m = s.match(/^(\d+)\s*days?$/)
  if (m && issueDate) {
    const d = new Date(issueDate)
    d.setDate(d.getDate() + Number(m[1]))
    return d
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

function detectIssueType(text) {
  const t = String(text || '').toLowerCase()
  if (/attendance|late|absent|punctual/.test(t)) return 'ATTENDANCE'
  if (/misconduct|behaviour|behavior|disrespect|insubordin/.test(t)) return 'MISCONDUCT'
  return 'PERFORMANCE'
}

async function main() {
  const prisma = new PrismaClient()

  // Wake Neon
  for (let i = 1; i <= 10; i++) {
    try { await prisma.$queryRaw`SELECT 1`; break }
    catch (e) {
      if (i === 10) throw e
      console.log(`Waking DB… ${i}/10`)
      await new Promise(r => setTimeout(r, 4000))
    }
  }

  console.log(`Reading ${XLSX_PATH}…`)
  const wb = XLSX.readFile(XLSX_PATH)
  const sheet = wb.Sheets[SHEET_NAME]
  if (!sheet) {
    console.error(`Sheet "${SHEET_NAME}" not found. Available:`, Object.keys(wb.Sheets))
    process.exit(1)
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', header: 1 })

  // Find header row — first row that has "Candidate" or "Employee" in column B
  let headerRow = 0
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const joined = (rows[i] || []).join('|').toLowerCase()
    if (joined.includes('candidate') || joined.includes('performance issue')) {
      headerRow = i
      break
    }
  }
  const header = rows[headerRow].map(s => String(s).toLowerCase().trim())
  console.log(`Header row ${headerRow}:`, header)

  // Column index helpers
  const idx = (needle) => header.findIndex(h => h.includes(needle))
  const cDate         = idx('date')
  const cName         = idx('candidate') !== -1 ? idx('candidate') : idx('name')
  const cIssue        = idx('performance issue') !== -1 ? idx('performance issue') : idx('issue')
  const cDiscussion   = idx('discussion')
  const cResponse     = idx('employee response') !== -1 ? idx('employee response') : idx('response')
  const cActionPlan   = idx('action plan')
  const cDeadline     = idx('deadline')
  const cFollowUp     = idx('follow-up') !== -1 ? idx('follow-up') : idx('followup')
  const cNotes        = idx('note') !== -1 ? idx('note') : idx('remark')

  console.log({ cDate, cName, cIssue, cDiscussion, cResponse, cActionPlan, cDeadline, cFollowUp, cNotes })

  // Build employee token map
  const allEmps = await prisma.employee.findMany({
    select: { id: true, fullName: true, employeeCode: true, legacyEmployeeCode: true },
  })
  const empTokens = allEmps.map(e => ({
    id: e.id,
    name: e.fullName,
    code: e.employeeCode,
    tokens: new Set(meaningfulTokens(e.fullName)),
  }))

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

  let created = 0, skipped = 0, unmatched = 0
  const unmatchedNames = new Set()

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] || []
    const rawName = String(row[cName] ?? '').trim()
    if (!rawName) continue
    if (/^(employee|name|total)$/i.test(rawName)) continue

    const issueDate = xlsxDate(row[cDate])
    if (!issueDate) {
      console.log(`  Row ${r}: skipped — no date for "${rawName}"`)
      skipped++
      continue
    }

    const match = matchEmployee(rawName)
    if (!match) {
      unmatchedNames.add(rawName)
      unmatched++
      continue
    }

    // Idempotent check — skip if a ShowCause already exists for this employee on this date
    const existing = await prisma.showCause.findFirst({
      where: {
        employeeId: match.id,
        OR: [
          { issueDate: issueDate },
          { meetingHeldAt: issueDate },
        ],
      },
    })
    if (existing) {
      skipped++
      continue
    }

    const issueText      = String(row[cIssue] ?? '').trim()
    const discussionText = String(row[cDiscussion] ?? '').trim()
    const responseText   = String(row[cResponse] ?? '').trim()
    const actionPlan     = String(row[cActionPlan] ?? '').trim()
    const followUpDate   = xlsxDate(row[cFollowUp])
    const notes          = String(row[cNotes] ?? '').trim()
    const deadline       = parseDeadline(row[cDeadline], issueDate)

    const description = [issueText, discussionText].filter(Boolean).join('\n\n')

    let status = 'ISSUED'
    if (/close|closed|resolved/i.test(notes)) status = 'RESOLVED'
    else if (responseText) status = 'RESPONDED'

    await prisma.showCause.create({
      data: {
        employeeId: match.id,
        issueType: detectIssueType(`${issueText} ${discussionText}`),
        issueDate,
        description: description || null,
        deadline,
        employeeResponse: responseText || null,
        responseAt: responseText ? followUpDate || issueDate : null,
        actionPlan: actionPlan || null,
        followUpDate,
        outcome: notes || null,
        status,
        issuedBy: 'Imported from master sheet',
      },
    })
    created++
    console.log(`  + ${match.name} (${match.code}) — ${issueDate.toISOString().slice(0, 10)} → ${status}`)
  }

  console.log('\n=== Done ===')
  console.log(`Created:   ${created}`)
  console.log(`Skipped:   ${skipped}`)
  console.log(`Unmatched: ${unmatched}`)
  if (unmatchedNames.size) {
    console.log('Unmatched names (check master sheet vs Employee.fullName):')
    for (const n of unmatchedNames) console.log(`  · ${n}`)
  }

  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })

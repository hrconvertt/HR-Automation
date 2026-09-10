/**
 * Import the sourcing workbook's candidates.
 *
 *   node scripts/import-sourcing-candidates.mjs --file "<path.xlsx>" [--write]
 *
 * Without --write it reads, maps and reports, and touches nothing.
 *
 * The workbook is fourteen role sheets with no common header row between
 * them — QA Engineer alone has twenty-six columns of evaluation. So the
 * mapping is by pattern rather than position, and everything that is not
 * mapped to a column of its own is kept verbatim in `notes`. That evaluation
 * text is the most valuable thing in the file and none of it is thrown away.
 *
 * Deliberate refusals:
 *   - No email is invented. Candidate.email is a required column, so a row
 *     with no address on it is stored with an empty one rather than a made-up
 *     address that would later be mailed.
 *   - Nobody's stage is guessed from a verdict. The verdicts are free text
 *     ("STRONG", "NO", "maybe", a paragraph) and mis-filing someone as
 *     rejected is not undone by reading the note afterwards. Everyone lands
 *     on APPLIED with their verdict in `notes`.
 *   - `source` is left null rather than asserted as LinkedIn. The workbook
 *     says LinkedIn is the primary channel; it does not say it per candidate.
 *
 * Re-runnable: a candidate already on a requisition with the same name and
 * the same contact detail is skipped, not duplicated.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
require('dotenv').config({ path: '.env.local' })
const XLSX = require('xlsx')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const args = process.argv.slice(2)
const WRITE = args.includes('--write')
const fileArg = args.indexOf('--file')
const FILE = fileArg >= 0 ? args[fileArg + 1] : null
if (!FILE || !fs.existsSync(FILE)) {
  console.error('Pass --file "<path to .xlsx>"')
  process.exit(1)
}

/**
 * Sheet -> requisition, as confirmed by HR on 10 Sep 2026.
 *   Marketing folds into Creative Marketing Associate.
 *   Both UI/UX sheets go to the one Graphic Designer - UIUX requisition.
 *   "UIUX Designer - Technical Asess" is a byte-for-byte duplicate of
 *   "UIUX Designer" — same 215 names in the same order — so it is skipped.
 */
const SHEET_TO_REQ = {
  'QA Engineer': 'cmsirdhx600016tnhjzizhaj2',
  'CRO Strategist': 'cmsivy29s0005yns08k8cv377',
  'Business Partnerships & Growth ': 'cmsivxzl70003yns0l0syhlvz',
  'Marketing': 'cmrj1j99k0003kg7cx73ud552',
  'Creative Marketing Associate': 'cmrj1j99k0003kg7cx73ud552',
  'AI Intern': 'cmsj1ic6l0000i0711n33e1n1',
  'Meta Ads Expert': 'cmsivzs1n000310zbhdi08yk8',
  'Financial Analyst': 'cmsivztuh000410zbd169h3cr',
  'UIUX Designer': 'cmsivzvm6000510zbssiypn0s',
  'Shopify': 'cmsivzq9o000210zb638f9ga2',
  'Project Coordinator': 'cmsivzohr000110zb0ne24irm',
  'Business Development ': 'cmsivzmqb000010zbqfpmsyhf',
  'Graphic Designer - UI': 'cmsivzvm6000510zbssiypn0s',
}
/** The empty duplicate requisition HR asked to have removed. */
const DUP_REQ_TO_DELETE = 'cmsivxwn20001yns0uzaapk0h'

const clean = (v) => {
  if (v === null || v === undefined) return null
  const s = String(v).replace(/\s+/g, ' ').trim()
  if (!s || s === '-' || s === '—' || s === '#ERROR!' || s.toLowerCase() === 'n/a') return null
  return s
}

/** Find a value by matching the header, in the order the patterns are given. */
function pick(row, patterns) {
  for (const re of patterns) {
    for (const [k, v] of Object.entries(row)) {
      if (re.test(k)) {
        const c = clean(v)
        if (c) return c
      }
    }
  }
  return null
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/

/**
 * Several sheets have the address buried in a cell with two phone numbers and
 * angle brackets around it. Extracting one is not inventing one.
 */
function findEmail(row) {
  for (const v of Object.values(row)) {
    const s = v == null ? '' : String(v)
    const m = s.match(EMAIL_RE)
    if (m) return m[0].toLowerCase()
  }
  return ''
}

/**
 * A phone number, or nothing.
 *
 * The first pass scraped "2024-2025 (" out of an experience summary, because
 * the QA sheet stores "#ERROR!" in its phone column and the fallback was free
 * to read any cell. It now only reads cells that are meant to hold contact
 * details, wants at least nine digits, and refuses anything shaped like a year
 * range.
 */
const YEAR_RANGE = /(19|20)\d{2}\s*[-–]\s*(19|20)\d{2}/
const CONTACT_HEADER = /phone|contact|mobile|cell|email|^name\s*$/i

function phoneish(s) {
  if (!s || YEAR_RANGE.test(s)) return null
  const m = s.match(/\+?\d[\d\s\-()]{7,}\d/)
  if (!m) return null
  const token = m[0].trim()
  const digits = token.replace(/\D/g, '')
  if (digits.length < 9 || digits.length > 15) return null
  return token.replace(/\s+/g, ' ').slice(0, 40)
}

function findPhone(row) {
  const direct = phoneish(pick(row, [/^phone/i, /contact/i, /mobile/i]))
  if (direct) return direct
  for (const [k, v] of Object.entries(row)) {
    if (!CONTACT_HEADER.test(k)) continue
    const hit = phoneish(v == null ? '' : String(v))
    if (hit) return hit
  }
  return null
}

/** A number out of 100, where the sheet scored one. */
function findScore(row) {
  for (const [k, v] of Object.entries(row)) {
    if (/fit score/i.test(k)) {
      const n = Number(String(v ?? '').replace(/[^\d.]/g, ''))
      if (Number.isFinite(n) && n > 0 && n <= 100) return n
    }
  }
  return null
}

const MAPPED = [
  /^name\s*$/i, /^phone/i, /^email/i, /^location/i,
  /current company/i, /^job title/i, /current job title/i, /headline/i,
  /fit score/i,
]
function isMapped(header) {
  return MAPPED.some((re) => re.test(header))
}

/** Everything the columns above did not take, kept verbatim. */
function buildNotes(sheet, row) {
  const lines = [`Sourced via the recruitment workbook — sheet "${sheet.trim()}".`]
  for (const [k, v] of Object.entries(row)) {
    if (isMapped(k)) continue
    const c = clean(v)
    if (!c) continue
    const label = k.replace(/\s+/g, ' ').trim()
    if (!label || /^__EMPTY/.test(label)) continue
    lines.push(`${label}: ${c}`)
  }
  return lines.join('\n').slice(0, 6000)
}

const main = async () => {
  const wb = XLSX.readFile(FILE)
  const reqs = await prisma.jobRequisition.findMany({ select: { id: true, title: true } })
  const reqById = new Map(reqs.map((r) => [r.id, r.title]))

  // Everyone already on file, so a re-run adds nobody twice.
  const existing = await prisma.candidate.findMany({
    select: { requisitionId: true, fullName: true, email: true, phone: true },
  })
  const seen = new Set(
    existing.map((c) => `${c.requisitionId}|${c.fullName.toLowerCase()}|${(c.email || c.phone || '').toLowerCase()}`),
  )

  const planned = []
  const report = []
  let skippedDupes = 0
  let noContact = 0

  for (const sheet of wb.SheetNames) {
    const reqId = SHEET_TO_REQ[sheet]
    if (!reqId) continue
    if (!reqById.has(reqId)) {
      console.error(`Sheet "${sheet}" maps to a requisition that no longer exists: ${reqId}`)
      process.exit(1)
    }
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: null, blankrows: false })
    let took = 0
    for (const row of rows) {
      const fullName = pick(row, [/^name\s*$/i])
      if (!fullName) continue
      const email = findEmail(row)
      const phone = findPhone(row)
      if (!email && !phone) noContact++

      const key = `${reqId}|${fullName.toLowerCase()}|${(email || phone || '').toLowerCase()}`
      if (seen.has(key)) { skippedDupes++; continue }
      seen.add(key)

      planned.push({
        requisitionId: reqId,
        fullName,
        email,
        phone,
        location: pick(row, [/^location/i]),
        currentCompany: pick(row, [/current company/i, /^current compnay/i, /^previous company/i]),
        currentRole: pick(row, [/current job title/i, /^job title/i, /headline/i]),
        matchScore: findScore(row),
        notes: buildNotes(sheet, row),
        stage: 'APPLIED',
        knockoutStatus: 'PENDING',
      })
      took++
    }
    report.push({ sheet: sheet.trim(), req: reqById.get(reqId), took })
  }

  console.log('\n  rows   sheet                              → requisition')
  for (const r of report) {
    console.log(`  ${String(r.took).padStart(4)}   ${r.sheet.padEnd(34)} → ${r.req}`)
  }
  console.log(`\n  to import: ${planned.length}`)
  console.log(`  already on file, skipped: ${skippedDupes}`)
  console.log(`  with an email: ${planned.filter((p) => p.email).length}`)
  console.log(`  with a phone:  ${planned.filter((p) => p.phone).length}`)
  console.log(`  with neither:  ${noContact}`)
  console.log(`  with a fit score: ${planned.filter((p) => p.matchScore != null).length}`)

  console.log('\n  sample:')
  for (const p of planned.slice(0, 3)) {
    console.log(`   ${p.fullName} | ${p.email || '(no email)'} | ${p.phone || '(no phone)'} | ${p.location || '-'} | score ${p.matchScore ?? '-'}`)
    console.log(`     notes: ${p.notes.split('\n').slice(0, 2).join(' / ').slice(0, 180)}…`)
  }

  if (!WRITE) {
    console.log('\n  DRY RUN — nothing written. Re-run with --write.')
    await prisma.$disconnect()
    return
  }

  let made = 0
  for (let i = 0; i < planned.length; i += 100) {
    const batch = planned.slice(i, i + 100)
    await prisma.candidate.createMany({ data: batch })
    made += batch.length
    process.stdout.write(`\r  written ${made}/${planned.length}`)
  }
  console.log('')

  // The empty duplicate requisition HR asked to have removed. Guarded: it only
  // goes if it is still empty, so nothing can be deleted out from under a row.
  const dup = await prisma.jobRequisition.findUnique({
    where: { id: DUP_REQ_TO_DELETE },
    select: { id: true, title: true, _count: { select: { candidates: true } } },
  })
  if (dup && dup._count.candidates === 0) {
    await prisma.jobRequisition.delete({ where: { id: dup.id } })
    console.log(`  deleted the empty duplicate requisition "${dup.title}"`)
  } else if (dup) {
    console.log(`  left "${dup.title}" alone — it now has ${dup._count.candidates} candidates`)
  }

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})

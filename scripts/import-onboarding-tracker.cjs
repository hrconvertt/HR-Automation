/**
 * Import the "Onboarding Tracker" tab from the Convertt master sheet.
 *
 * The app showed every long-tenured employee as "0 of 13 steps · OVERDUE"
 * because their onboarding was recorded in the sheet, never in the app. This
 * copies the real record across.
 *
 * Value semantics, taken from the sheet itself:
 *   "Yes"  → step done.
 *   "N/A"  → step not applicable to this person. The sheet excludes these from
 *            its own Tasks Done / Total Tasks (Waqas Fareed is 13/13, not
 *            13/15), and its status is "✅ Completed". So N/A is marked done to
 *            match, and every N/A step is listed in `notes` so the distinction
 *            between "done" and "never applied" is not lost.
 *   blank  → not done.
 *
 * Three sheet columns have no field on OnboardingChecklist — Address Proof,
 * Email ID Created, ID Card Issued. They are recorded in `notes` rather than
 * forced into an unrelated field.
 *
 * Run:  node scripts/import-onboarding-tracker.cjs [--apply]
 */
const XLSX = require('xlsx')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
})
const APPLY = process.argv.includes('--apply')
const FILE = process.env.MASTER_SHEET
  || 'C:/Users/HRConvertt/Downloads/Master Sheet - Convertt_HR.xlsx'

// sheet column -> OnboardingChecklist boolean field
const FIELD_MAP = {
  'Welcome Email Sent': 'welcomeEmailSent',
  'First Day Induction': 'firstDayCompleted',
  'Offer Letter Issued': 'offerLetterIssued',
  'Agreement Signed': 'agreementSigned',
  'NDA Signed': 'ndaSigned',
  'CNIC Collected': 'cnicCopied',
  'Photo Collected': 'photoTaken',
  'Education Cert': 'educationDocsCopied',
  'Bank Details': 'bankDetailsCollected',
  'System Access Given': 'systemAccessGranted',
  'Laptop/Asset Issued': 'equipmentIssued',
  'Policy Explained': 'introductionDone',
}
// Real steps in the sheet with no matching column on the model.
const UNMAPPED = ['Address Proof', 'Email ID Created', 'ID Card Issued']

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()

async function main() {
  for (let i = 0; i < 6; i++) {
    try { await prisma.$queryRaw`SELECT 1`; break } catch (e) {
      if (i === 5) throw e
      await new Promise((r) => setTimeout(r, 3000))
    }
  }

  const aoa = XLSX.utils.sheet_to_json(
    XLSX.readFile(FILE).Sheets['Onboarding Tracker'], { header: 1, defval: null })
  const hdr = aoa[3].map((h) => (h === null ? '' : String(h).trim()))
  const rows = aoa.slice(4).filter((r) => r[0] && String(r[0]).trim())
  const col = (r, name) => {
    const i = hdr.indexOf(name)
    return i === -1 || r[i] === null ? '' : String(r[i]).trim()
  }

  const employees = await prisma.employee.findMany({
    select: { id: true, employeeCode: true, legacyEmployeeCode: true, fullName: true },
  })
  const nameCount = new Map()
  for (const e of employees) nameCount.set(norm(e.fullName), (nameCount.get(norm(e.fullName)) || 0) + 1)
  const byName = new Map()
  for (const e of employees) if (nameCount.get(norm(e.fullName)) === 1) byName.set(norm(e.fullName), e)
  const byCode = new Map()
  for (const e of employees) {
    if (e.employeeCode) byCode.set(e.employeeCode.trim().toUpperCase(), e)
    if (e.legacyEmployeeCode) byCode.set(e.legacyEmployeeCode.trim().toUpperCase(), e)
  }

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — Onboarding Tracker\n${'='.repeat(72)}`)
  let written = 0
  let tasksClosed = 0
  const unmatched = []
  const conflicts = []

  for (const r of rows) {
    const code = col(r, 'Employee ID')
    const name = col(r, 'Full Name')
    const status = col(r, 'Onboarding Status')

    // Name first — the sheet's codes have proved stale against the DB before.
    const byNameHit = byName.get(norm(name))
    const byCodeHit = byCode.get(code.toUpperCase())
    const emp = byNameHit ?? (byCodeHit && norm(byCodeHit.fullName) === norm(name) ? byCodeHit : null)
    if (!emp) { unmatched.push(`${code} ${name}`); continue }
    if (byNameHit && byCodeHit && byNameHit.id !== byCodeHit.id) {
      conflicts.push(`${code} "${name}": code→${byCodeHit.fullName}, name→${byNameHit.fullName} (used name)`)
    }

    const data = {}
    const naSteps = []
    for (const [sheetCol, field] of Object.entries(FIELD_MAP)) {
      const v = col(r, sheetCol).toUpperCase()
      if (v === 'YES') data[field] = true
      else if (v === 'N/A' || v === 'NA') { data[field] = true; naSteps.push(sheetCol) }
      else data[field] = false
    }
    for (const u of UNMAPPED) {
      const v = col(r, u).toUpperCase()
      if (v === 'N/A' || v === 'NA') naSteps.push(u)
    }

    const done = col(r, 'Tasks Done')
    const total = col(r, 'Total Tasks')
    const isComplete = /completed/i.test(status)
    const noteLines = [
      `Imported from master sheet "Onboarding Tracker" (${done}/${total}, ${status || 'no status'}).`,
      naSteps.length ? `Not applicable: ${naSteps.join(', ')}.` : null,
      `Steps tracked in the sheet but not on this checklist: ${UNMAPPED.join(', ')}.`,
    ].filter(Boolean)

    data.status = isComplete ? 'COMPLETED' : /progress/i.test(status) ? 'IN_PROGRESS' : 'NOT_STARTED'

    // The tracker has no "Experience Letters" column, but the onboarding page
    // counts `experienceLettersCopied` as one of its 13 steps — leaving it false
    // pinned every imported employee at 12/13 and therefore permanently
    // "OVERDUE". Where the sheet's own status is ✅ Completed, take that as
    // covering this step too, and say so in the notes rather than implying the
    // sheet tracked it.
    if (isComplete) {
      data.experienceLettersCopied = true
      noteLines.push('Experience letters marked done from the overall "Completed" status in the sheet (the tracker has no column for it).')
    }
    data.notes = noteLines.join(' ')

    if (APPLY) {
      const cl = await prisma.onboardingChecklist.upsert({
        where: { employeeId: emp.id },
        update: data,
        create: { employeeId: emp.id, ...data },
      })
      // Some checklists carry OnboardingTask rows, and the page reads progress
      // from those in preference to the booleans. Setting only the booleans left
      // those employees showing "0 of 17". Where the sheet says onboarding is
      // complete, close out the tasks too so both paths agree.
      if (isComplete) {
        const n = await prisma.onboardingTask.updateMany({
          where: { checklistId: cl.id, status: { not: 'COMPLETED' } },
          data: { status: 'COMPLETED', isComplete: true, completedAt: new Date(), notes: 'Completed per master sheet Onboarding Tracker' },
        })
        if (n.count) tasksClosed += n.count
      }
    }
    written++
    const flag = naSteps.length ? ` · ${naSteps.length} N/A` : ''
    console.log(`  ${emp.employeeCode.padEnd(15)} ${name.padEnd(26)} ${String(done + '/' + total).padStart(6)}  ${data.status}${flag}`)
  }

  console.log(`\nchecklists ${APPLY ? 'written' : 'to write'}: ${written}`)
  if (APPLY) console.log(`onboarding tasks closed out: ${tasksClosed}`)
  if (conflicts.length) {
    console.log('\nCODE/NAME CONFLICTS (resolved by name):')
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

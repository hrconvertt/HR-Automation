/**
 * Import the Convertt HR Playbook (CVT-HR-PB-001) into the Policies module.
 *
 *   node scripts/import-hr-playbook.cjs [--activate]
 *
 * The Playbook is the controlling HR document — its own section 1.1 says it
 * "replaces scattered individual policy documents as the primary reference;
 * where a standalone policy exists, this Playbook states the controlling
 * rule". So it goes in as one policy carrying the whole text, and the report
 * at the end lists which of the existing standalone policies it now overrides
 * so HR can retire them deliberately rather than by accident.
 *
 * Idempotent: matched on title, so re-running updates the body in place.
 *
 * It lands as DRAFT unless --activate is passed. Activating publishes it to
 * every employee and raises an acknowledgment for each of them — not something
 * a script should do on its own.
 */
// .env still holds a stale sqlite URL from before the move to Supabase, and
// Prisma reads .env, not .env.local. Override explicitly.
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env.local'), override: true })

const fs = require('node:fs')
const mammoth = require('mammoth')
const { PrismaClient } = require('@prisma/client')

const SRC = String.raw`C:\Users\HRConvertt\Documents\New Policies\Convertt HR Playbook 2026\Convertt_HR_Playbook.docx`

const TITLE = 'HR Playbook (CVT-HR-PB-001)'
const VERSION = '1.0'
const EFFECTIVE = new Date(Date.UTC(2026, 8, 1)) // 1 September 2026

/**
 * The standalone policies the Playbook now speaks for. Listed, not deleted —
 * retiring a policy an employee has already acknowledged is HR's call.
 */
const SUPERSEDED = [
  'Code of Ethics',
  'Anti-Bribery & Gifts Policy',
  'Anti-Harassment Policy',
  'Conflict of Interest Policy',
  'Moonlighting Policy',
  'Whistleblower Policy',
  'IT Acceptable Use Policy',
  'Leave Policy',
  'Career Ladder Policy',
  'Bonus & Increment Policy',
  'Compensation & Benefits Policy',
  'Probation & Confirmation Policy',
  'Exit & Offboarding Policy',
  'Performance Appraisal & KPI Policy',
  'Employee Handbook',
]

/**
 * Mammoth inlines every image in the .docx as a base64 data URI. The Playbook
 * carries the logo twice at full print resolution, which is ~350KB of markup
 * that renders as a cover graphic nobody reads on a policy page.
 */
function stripImages(html) {
  return html.replace(/<img[^>]*>/g, '')
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Not found: ${SRC}`)
    process.exit(1)
  }

  const { value, messages } = await mammoth.convertToHtml({ path: SRC })
  for (const m of messages) console.warn(`  mammoth: ${m.message}`)
  const content = stripImages(value)
  console.log(`Playbook body: ${(content.length / 1024).toFixed(0)}KB of HTML`)

  const prisma = new PrismaClient()
  const activate = process.argv.includes('--activate')

  const existing = await prisma.policyDocument.findFirst({ where: { title: TITLE } })

  const data = {
    title: TITLE,
    category: 'GENERAL',
    type: 'HR_POLICY',
    description:
      'The single operating manual for people operations at Convertt — employment ' +
      'policies, HR procedures and the due-diligence checks for every stage of the ' +
      'employee lifecycle, across Pakistan and the UAE. Where a standalone policy ' +
      'exists, this Playbook states the controlling rule.',
    content,
    version: VERSION,
    effectiveDate: EFFECTIVE,
    audience: 'ALL',
    requiresAck: true,
    status: activate ? 'ACTIVE' : 'DRAFT',
    ...(activate ? { activatedAt: new Date(), publishedAt: new Date() } : {}),
  }

  const saved = existing
    ? await prisma.policyDocument.update({ where: { id: existing.id }, data })
    : await prisma.policyDocument.create({ data })

  console.log(`${existing ? 'Updated' : 'Created'} "${saved.title}" — ${saved.status}, v${saved.version}`)

  // What it now speaks for.
  const overlapping = await prisma.policyDocument.findMany({
    where: { title: { in: SUPERSEDED }, status: { not: 'ARCHIVED' } },
    select: { title: true, status: true, requiresAck: true },
    orderBy: { title: 'asc' },
  })
  if (overlapping.length) {
    console.log(`\n${overlapping.length} standalone policies the Playbook now overrides:`)
    for (const p of overlapping) {
      console.log(`  · ${p.title}  (${p.status}${p.requiresAck ? ', acknowledged' : ''})`)
    }
    console.log('\nNone were changed. Archive them from the Policies tab when you are ready.')
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

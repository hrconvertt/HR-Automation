/**
 * Import the HR document archive (termination letters, experience letters,
 * relieving certificates, NDAs, show cause notices, exit forms) from a folder
 * of PDFs into EmployeeDocument, bytes and all.
 *
 * These are the files circulated over WhatsApp and Drive. The app held almost
 * none of them: 10 of 15 leavers had no documents at all, and there were zero
 * termination letters, relieving certificates or exit clearance forms.
 *
 * The employee is taken from the FILENAME, which is how they are named in
 * practice ("Termination Letter Muhammad Affan Waseem.docx.pdf"). Matching is
 * exact against a normalised full name, or an explicitly confirmed alias.
 * Anything ambiguous is reported and skipped — a termination letter filed
 * against the wrong person is worse than one not filed at all.
 *
 * Generic files with no person in the name ("NDA - AGREEMENT.pdf",
 * "Exit Clearance Form.docx.pdf") are blank templates, not someone's record,
 * and are skipped.
 *
 * Idempotent: an employee + document-name pair is never created twice.
 *
 * Run:  node scripts/import-hr-documents.cjs [--apply] [--dir "C:/path"]
 */
require('dotenv').config({ path: '.env.local' })
const fs = require('fs')
const path = require('path')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
})
const APPLY = process.argv.includes('--apply')
const dirFlag = process.argv.indexOf('--dir')
const DIR = dirFlag !== -1 ? process.argv[dirFlag + 1] : 'C:/Users/HRConvertt/Downloads'

/**
 * Filename pattern -> document type + display name.
 * Order matters: the first match wins, so the more specific patterns lead.
 */
const KINDS = [
  { re: /relieving\s*certificate/i,          type: 'RELIEVING_CERTIFICATE', label: 'Relieving Certificate' },
  { re: /experience\s*letter/i,              type: 'EXPERIENCE',            label: 'Experience Letter' },
  { re: /show\s*cause/i,                     type: 'SHOW_CAUSE',            label: 'Show Cause Notice' },
  { re: /notice\s*period/i,                  type: 'NOTICE_PERIOD',         label: 'Notice Period Letter' },
  { re: /termination\s*letter|^TL\s*-/i,     type: 'TERMINATION_LETTER',    label: 'Termination Letter' },
  { re: /exit\s*(clearance\s*)?form|annexure\s*e/i, type: 'EXIT_CLEARANCE', label: 'Exit Clearance Form' },
  { re: /exit\s*interview/i,                 type: 'EXIT_INTERVIEW',        label: 'Exit Interview Form' },
  { re: /employment\s*letter/i,              type: 'OFFER_LETTER',          label: 'Employment Letter' },
  { re: /\bNDA\b|non[-\s]?disclosure/i,      type: 'NDA',                   label: 'NDA' },
]

/** Confirmed short forms used in filenames. */
const NAME_ALIASES = {
  'aelia': 'Syeda Manqbat Aelia',
  'affan': 'Muhammad Affan Waseem',
  'altaf': 'Altaf Yaseen',
  'ammar': 'Muhammad Ammar Younas',
  'aqib': 'Aqib Aslam',
  'atta': 'Atta Ur Rehman',
  'farzeen': 'Muhammad Farzeen Khan',
  'huzaifa': 'Huzaifa Hakeem',
  'iqra': 'Iqra Naveed',
  'irfan': 'Muhammad Irfan',
  'mahnoor': 'Mahnoor Riaz',
  'momin': 'Momin Munir',
  'momna': 'Momna Waryam Khan',
  'muzaffar': 'Muzaffar Jamil',
  'rayyan': 'Muhammad Rayyan',
  'salman': 'Muhammad Salman Shahid',
  'taha': 'Sheikh Taha Adnan',
  'taiyba': 'Taiyba Naeem',
  'umar': 'Umar Ameen',
  'usman': 'Muhammad Usman Saeed',
  'waqas': 'Muhammad Waqas Fareed',
  'zuhaa jutt': 'Zuhaa Shafi',
  'mannan': 'Laiba Mannan',
  'umer afzal': 'Umer Afzal',
  'abdul rehman': null,   // not an employee — candidate paperwork
  'mahad hassan': null,
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()

/** Strip the document words out of a filename, leaving the person. */
function personFromFile(file) {
  let s = path.basename(file, path.extname(file))
  // .docx can sit mid-string: "Termination Letter X.docx (1).pdf" leaves it
  // stranded once the trailing "(1)" is removed.
  s = s.replace(/\.docx?/gi, ' ')
  s = s.replace(/\(\d+\)/g, ' ')
  s = s.replace(/relieving\s*certificate|experience\s*letter|show\s*cause\s*notice|notice\s*period|termination\s*letter|exit\s*clearance\s*form|exit\s*interview\s*form|exit\s*form|employment\s*letter|annexure\s*e|agreement|format|^TL\b|\bNDA\b/gi, ' ')
  s = s.replace(/[_\-–—]+/g, ' ')
  return s.replace(/\s+/g, ' ').trim()
}

async function main() {
  for (let i = 0; i < 6; i++) {
    try { await prisma.$queryRaw`SELECT 1`; break } catch (e) {
      if (i === 5) throw e
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
  if (!fs.existsSync(DIR)) { console.error(`Folder not found: ${DIR}`); process.exit(1) }

  const files = fs.readdirSync(DIR).filter((f) => /\.pdf$/i.test(f))

  const employees = await prisma.employee.findMany({
    select: { id: true, employeeCode: true, fullName: true },
  })
  const count = new Map()
  for (const e of employees) count.set(norm(e.fullName), (count.get(norm(e.fullName)) || 0) + 1)
  const byName = new Map()
  for (const e of employees) if (count.get(norm(e.fullName)) === 1) byName.set(norm(e.fullName), e)

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — scanning ${files.length} PDFs in ${DIR}\n${'='.repeat(94)}`)

  let created = 0, dupes = 0
  const templates = []
  const ambiguous = []
  const perType = {}

  for (const file of files) {
    const kind = KINDS.find((k) => k.re.test(file))
    if (!kind) continue

    const person = personFromFile(file)
    if (!person || person.length < 3) { templates.push(file); continue }

    const key = norm(person)
    let target = byName.get(key)
    if (!target && Object.prototype.hasOwnProperty.call(NAME_ALIASES, key)) {
      const alias = NAME_ALIASES[key]
      if (alias === null) continue          // known non-employee
      target = byName.get(norm(alias))
    }
    if (!target) {
      // Last resort: a unique full-name containment. Reported, never silent.
      const hits = employees.filter((e) => norm(e.fullName).includes(key) && key.split(' ').length > 1)
      if (hits.length === 1) target = hits[0]
    }
    if (!target) { ambiguous.push(`${file}   -> "${person}"`); continue }

    const full = path.join(DIR, file)
    const bytes = fs.readFileSync(full)
    const name = kind.label

    const exists = await prisma.employeeDocument.findFirst({
      where: { employeeId: target.id, name, type: kind.type },
      select: { id: true },
    })
    if (exists) { dupes++; continue }

    if (APPLY) {
      await prisma.employeeDocument.create({
        data: {
          employeeId: target.id, type: kind.type, name, url: '',
          fileBlob: bytes, fileMimeType: 'application/pdf', fileSize: bytes.length,
          mimeType: 'application/pdf', size: bytes.length,
          visibleToEmployee: kind.type !== 'SHOW_CAUSE',
        },
      })
    }
    perType[kind.type] = (perType[kind.type] || 0) + 1
    created++
    console.log(`  ${target.employeeCode.padEnd(15)}${target.fullName.padEnd(26)}${kind.label.padEnd(24)}${file.slice(0, 40)}`)
  }

  console.log(`\n${'='.repeat(94)}`)
  console.log(`documents ${APPLY ? 'imported' : 'to import'}: ${created}   already present: ${dupes}`)
  const rows = Object.entries(perType).sort((a, b) => b[1] - a[1])
  if (rows.length) { console.log('\nby type:'); for (const [t, n] of rows) console.log(`  ${t.padEnd(24)}${n}`) }
  if (templates.length) console.log(`\nblank templates with no person in the name (${templates.length}) — skipped`)
  if (ambiguous.length) {
    console.log(`\nCOULD NOT MATCH A PERSON (${ambiguous.length}) — skipped, add an alias if any are real:`)
    for (const a of ambiguous.slice(0, 25)) console.log('  ' + a)
    if (ambiguous.length > 25) console.log(`  … and ${ambiguous.length - 25} more`)
  }
  if (!APPLY) console.log('\nNothing written. Re-run with --apply.')
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error(e.message || e); await prisma.$disconnect(); process.exit(1) })

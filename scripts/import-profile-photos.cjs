/**
 * Import employee profile pictures from a folder of image files.
 *
 * Files are named after the person ("Abdullah Shafiq PFP.png"), so the match is
 * on NAME, never on a code — the master sheets' employee codes point at
 * different people than the database's.
 *
 * Matching is exact (after stripping the "PFP" suffix and the extension) or via
 * an explicit alias below. Nothing is fuzzy-matched: partial-name guessing is
 * what previously folded "Muhammad Hassan" into "Ali Hassan". Unmatched files
 * are reported with near-miss suggestions for a human to confirm, and skipped.
 *
 * Each photo is stored as a PHOTO EmployeeDocument holding the bytes, and
 * `employee.photoUrl` is pointed at /api/employees/<id>/photo, which serves the
 * newest one. Re-running replaces a previously imported photo rather than
 * stacking duplicates.
 *
 * Run:  node scripts/import-profile-photos.cjs [--apply] [--dir "C:/path"]
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

/** Filename stem -> employee full name. Only add entries a human confirmed. */
const NAME_ALIASES = {
  // Each of these had exactly one candidate in the directory.
  'Sheikh Taha': 'Sheikh Taha Adnan',
  'Muhammad Atta Ur Rehman': 'Atta Ur Rehman',
  'Khawer B.': 'Syed Khawer',
  // The only two Syeds are Khawer and Asghar, and Khawer has his own file
  // above, so the abbreviated "Syed A." can only be Asghar.
  'Syed A.': 'Syed Asghar',
}

const EXT_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  // .jfif is a JPEG with a Windows-specific extension.
  '.jfif': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()

/** "Abdullah Shafiq PFP.png" -> "Abdullah Shafiq" */
function nameFromFile(file) {
  return path.basename(file, path.extname(file))
    .replace(/\s*\bPFP\b\s*/i, ' ')
    .replace(/\s*\(\d+\)\s*$/, ' ')
    .trim()
}

async function main() {
  for (let i = 0; i < 6; i++) {
    try { await prisma.$queryRaw`SELECT 1`; break } catch (e) {
      if (i === 5) throw e
      await new Promise((r) => setTimeout(r, 3000))
    }
  }

  if (!fs.existsSync(DIR)) {
    console.error(`Folder not found: ${DIR}`)
    process.exit(1)
  }

  const files = fs.readdirSync(DIR)
    .filter((f) => EXT_MIME[path.extname(f).toLowerCase()])
    .filter((f) => /\bPFP\b/i.test(f) || /^Muhammad Usman Saeed\./i.test(f))

  const employees = await prisma.employee.findMany({
    select: { id: true, employeeCode: true, fullName: true, photoUrl: true },
  })
  // Only index names that are unique, so an ambiguous name can never resolve.
  const count = new Map()
  for (const e of employees) count.set(norm(e.fullName), (count.get(norm(e.fullName)) || 0) + 1)
  const byName = new Map()
  for (const e of employees) if (count.get(norm(e.fullName)) === 1) byName.set(norm(e.fullName), e)

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${files.length} photo file(s) from ${DIR}\n${'='.repeat(78)}`)

  let imported = 0
  const unmatched = []

  for (const file of files) {
    const stem = nameFromFile(file)
    const target = NAME_ALIASES[stem] ?? stem
    const emp = byName.get(norm(target))
    if (!emp) {
      // Offer near misses purely as a hint for a human — never auto-applied.
      const first = norm(target).split(' ')[0]
      const hints = employees
        .filter((e) => norm(e.fullName).split(' ').includes(first))
        .map((e) => `${e.employeeCode} ${e.fullName}`)
      unmatched.push({ file, stem, hints })
      continue
    }

    const full = path.join(DIR, file)
    const bytes = fs.readFileSync(full)
    const mime = EXT_MIME[path.extname(file).toLowerCase()]

    if (APPLY) {
      // Replace any photo this importer previously filed, so re-running is
      // idempotent instead of stacking a new row every time.
      await prisma.employeeDocument.deleteMany({
        where: { employeeId: emp.id, type: 'PHOTO', name: { startsWith: 'Profile photo' } },
      })
      await prisma.employeeDocument.create({
        data: {
          employeeId: emp.id,
          type: 'PHOTO',
          name: `Profile photo — ${emp.fullName}`,
          url: '',
          fileBlob: bytes,
          fileMimeType: mime,
          fileSize: bytes.length,
          mimeType: mime,
          size: bytes.length,
          visibleToEmployee: true,
        },
      })
      await prisma.employee.update({
        where: { id: emp.id },
        data: { photoUrl: `/api/employees/${emp.id}/photo` },
      })
    }
    imported++
    console.log(`  ${emp.employeeCode.padEnd(14)} ${emp.fullName.padEnd(26)} ${file} (${(bytes.length / 1024).toFixed(0)} KB)`)
  }

  console.log(`\n${'='.repeat(78)}`)
  console.log(`photos ${APPLY ? 'imported' : 'to import'}: ${imported} of ${files.length}`)

  if (unmatched.length) {
    console.log(`\nNO EXACT MATCH (${unmatched.length}) — skipped, confirm before adding an alias:`)
    for (const u of unmatched) {
      console.log(`  "${u.stem}"  [${u.file}]`)
      if (u.hints.length) for (const h of u.hints) console.log(`       could be: ${h}`)
      else console.log('       no employee shares a name part')
    }
  }
  if (!APPLY) console.log('\nNothing written. Re-run with --apply.')
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })

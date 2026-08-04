/**
 * Fill real reasons onto backfilled leave requests, from the emails and
 * messages HR actually received.
 *
 * The attendance backfill created the requests but left a placeholder reason on
 * 67 of them, because inventing a plausible reason for someone's absence is
 * worse than an obvious blank. These are transcribed from the approval threads,
 * so each one is what the person actually wrote.
 *
 * Matches on employee + a date inside the request's range. Where a request does
 * not exist for that date the row is reported, not created — a leave with no
 * attendance behind it means the attendance is wrong, and that should be seen
 * rather than papered over.
 *
 * Run:  node scripts/fill-leave-reasons.cjs [--apply]
 */
require('dotenv').config({ path: '.env.local' })
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
})
const APPLY = process.argv.includes('--apply')

/**
 * Transcribed from the approval threads. `type` follows what was asked for:
 * SICK where illness was stated, CASUAL otherwise.
 */
const REASONS = [
  { name: 'Usman Ali',        date: '2026-07-30', type: 'CASUAL', reason: 'Emergency at home — informed HR the same morning' },
  { name: 'Ali Shan',         date: '2026-07-29', type: 'CASUAL', reason: "Grandmother admitted to hospital — accompanied her" },
  { name: 'Zuhaa Shafi',      date: '2026-07-28', type: 'SICK',   reason: 'Sudden illness — high fever, flu and vomiting' },
  { name: 'Laiba Mannan',     date: '2026-07-28', type: 'SICK',   reason: 'Severe ear infection — prescription provided; lead approved' },
  { name: 'Muhammad Irfan',   date: '2026-07-28', type: 'CASUAL', reason: 'University examination — arranged in advance with team lead' },
  { name: 'Muhammad Irfan',   date: '2026-07-31', type: 'CASUAL', reason: 'University examination — arranged in advance with team lead' },
  { name: 'Umer Afzal',       date: '2026-07-24', type: 'CASUAL', reason: 'Important personal work at home — requested in advance' },
  { name: 'Tayyab Hussain',   date: '2026-07-23', type: 'SICK',   reason: 'High fever and cold — team lead informed' },
  { name: 'Muzaffar Jamil',   date: '2026-07-16', type: 'CASUAL', reason: 'Bereavement — death of a close friend' },
]

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()

async function main() {
  for (let i = 0; i < 6; i++) {
    try { await prisma.$queryRaw`SELECT 1`; break } catch (e) {
      if (i === 5) throw e
      await new Promise((r) => setTimeout(r, 3000))
    }
  }

  const employees = await prisma.employee.findMany({ select: { id: true, employeeCode: true, fullName: true } })
  const count = new Map()
  for (const e of employees) count.set(norm(e.fullName), (count.get(norm(e.fullName)) || 0) + 1)
  const byName = new Map()
  for (const e of employees) if (count.get(norm(e.fullName)) === 1) byName.set(norm(e.fullName), e)

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${REASONS.length} reasons from the approval threads\n${'='.repeat(96)}`)

  let updated = 0
  const noRequest = []
  const noEmployee = []

  for (const r of REASONS) {
    const emp = byName.get(norm(r.name))
    if (!emp) { noEmployee.push(r.name); continue }

    const day = new Date(`${r.date}T00:00:00.000Z`)
    const req = await prisma.leaveRequest.findFirst({
      where: { employeeId: emp.id, fromDate: { lte: day }, toDate: { gte: day } },
      select: { id: true, reason: true, leaveType: true, fromDate: true, toDate: true },
    })
    if (!req) { noRequest.push(`${r.name.padEnd(22)} ${r.date}  ${r.reason.slice(0, 44)}`); continue }

    if (APPLY) {
      await prisma.leaveRequest.update({
        where: { id: req.id },
        data: { reason: r.reason, leaveType: r.type },
      })
    }
    updated++
    console.log(
      `  ${emp.employeeCode.padEnd(15)}${emp.fullName.padEnd(22)}${r.date}  ` +
      `${req.leaveType} -> ${r.type.padEnd(7)} ${r.reason.slice(0, 42)}`,
    )
  }

  console.log(`\n${'='.repeat(96)}`)
  console.log(`reasons ${APPLY ? 'written' : 'to write'}: ${updated}`)
  if (noRequest.length) {
    console.log(`\nNO LEAVE REQUEST COVERS THAT DATE (${noRequest.length}) — attendance may be missing the day:`)
    for (const x of noRequest) console.log('  ' + x)
  }
  if (noEmployee.length) console.log(`\nno matching employee: ${noEmployee.join(', ')}`)
  if (!APPLY) console.log('\nNothing written. Re-run with --apply.')
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error(e.message || e); await prisma.$disconnect(); process.exit(1) })

/* eslint-disable */
/**
 * scripts/sync-employee-emails.cjs
 *
 * One-shot sync of the canonical email list provided by HR. Matches each
 * row to an existing Employee by name (fuzzy: strips honorifics, uses
 * token overlap) and updates BOTH:
 *   - Employee.email
 *   - User.email
 *
 * Also clears User.clerkUserId so any stale Clerk link from a previous
 * (mismatched) sign-in attempt is broken. Next sign-in re-links cleanly.
 *
 * Idempotent: re-running with the same list is a no-op.
 *
 * Run locally with DATABASE_URL pointing at prod:
 *   node scripts/sync-employee-emails.cjs
 */

const { PrismaClient } = require('@prisma/client')

// Canonical list — HR's source of truth.
const ROSTER = [
  { name: 'Syed Asghar',              email: 'syed@convertt.co' },
  { name: 'Iqra Naveed',              email: 'accounts@convertt.co' },
  { name: 'Muhammad Waqas Fareed',    email: 'waqas@convertt.co' },
  { name: 'Tahreem Waheed',           email: 'hr@convertt.co' },
  { name: 'Sheikh Taha Adnan',        email: 'sheeikhtahag9t@gmail.com' },
  { name: 'Usman Ali',                email: 'usmanch7744@gmail.com' },
  { name: 'Tayyab Hussain',           email: 'tayyabhussainjutt146@gmail.com' },
  { name: 'Abdullah Shafiq',          email: 'abdullah@convertt.co' },
  { name: 'Zuhaa Jutt',               email: 'zuhaajutt345@gmail.com' },
  { name: 'Muhammad Usman Saeed',     email: 'usmansaeedsaeed658@gmail.com' },
  { name: 'Ali Hassan',               email: 'ahalihassanmalik@gmail.com' },
  { name: 'Umar Ameen',               email: 'umarameen0320@gmail.com' },
  { name: 'Altaf Yaseen',             email: 'snophysharp@gmail.com' },
  { name: 'Muhammad Ammar Younas',    email: 'ammar.softeng@gmail.com' },
  { name: 'Atta Ur Rehman',           email: 'support@convertt.co' },
  { name: 'Muzaffar Jamil',           email: 'muzaffarjamil11@gmail.com' },
  { name: 'Muhammad Ahsan',           email: 'chahsanikhlaq@gmail.com' },
  { name: 'Momna Waryam Khan',        email: 'momnafatima021@gmail.com' },
  { name: 'Muhammad Rayyan',          email: 'mrrayyan200@gmail.com' },
  { name: 'Muhammad Irfan',           email: 'official.irfanjanjua@gmail.com' },
  { name: 'Aqib Aslam',               email: 'aqibaslam100@gmail.com' },
  { name: 'Ali Shan',                 email: 'alishansadaqatali@gmail.com' },
  { name: 'Muhammad Salman Shahid',   email: 'salmanuix@gmail.com' },
  { name: 'Arslan',                   email: 'arsalanshah2002lhr@gmail.com' },
  { name: 'Muhammad Farzeen Khan',    email: 'shazibfarzeen@icloud.com' },
  { name: 'Huzaifa Hakeem',           email: 'ranahuzaifa666@gmail.com' },
  { name: 'Muhammad Hashir',          email: 'hashir@convertt.co' },
]

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
  let best = null, bestScore = 0
  for (const e of employees) {
    const eTokens = tokens(e.fullName)
    const eSet = new Set(eTokens)
    let overlap = 0
    for (const t of qSet) if (eSet.has(t)) overlap++
    if (overlap === 0) continue
    const exact = e.fullName.toLowerCase().includes(query.trim().toLowerCase())
    const score = overlap * 10 + (exact ? 5 : 0) - Math.abs(eTokens.length - qTokens.length)
    if (score > bestScore) { bestScore = score; best = e }
  }
  if (qTokens.length === 1 && bestScore < 10) return null
  if (qTokens.length >= 2 && bestScore < 20) return null
  return best
}

async function main() {
  const prisma = new PrismaClient()
  for (let i = 0; i < 5; i++) {
    try { await prisma.$queryRaw`SELECT 1`; break }
    catch { await new Promise((r) => setTimeout(r, 2000)) }
  }

  const employees = await prisma.employee.findMany({
    select: { id: true, fullName: true, email: true, userId: true },
  })

  const summary = { updated: 0, unchanged: 0, unmatched: [], conflicts: [] }

  for (const row of ROSTER) {
    const match = fuzzyMatch(row.name, employees)
    if (!match) {
      summary.unmatched.push(row.name)
      console.log(`[unmatched] ${row.name} → ${row.email}`)
      continue
    }

    const desired = row.email.toLowerCase().trim()
    const current = (match.email || '').toLowerCase().trim()

    if (current === desired) {
      summary.unchanged++
      console.log(`[unchanged] ${match.fullName}: ${desired}`)
      continue
    }

    // Conflict check: is another Employee/User already using this email?
    const conflictEmp = await prisma.employee.findFirst({
      where: { email: desired, NOT: { id: match.id } },
      select: { id: true, fullName: true },
    })
    const conflictUser = await prisma.user.findFirst({
      where: { email: desired, NOT: { id: match.userId ?? '' } },
      select: { id: true, email: true },
    })
    if (conflictEmp || conflictUser) {
      summary.conflicts.push({ row, conflict: conflictEmp?.fullName ?? conflictUser?.email })
      console.log(`[conflict] ${match.fullName} → ${desired} already used by ${conflictEmp?.fullName ?? conflictUser?.email}`)
      continue
    }

    // Update both Employee.email and the linked User.email (if exists).
    // Clear User.clerkUserId so stale Clerk links from prior signin attempts
    // are broken — next sign-in re-links cleanly with the new email.
    await prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id: match.id },
        data: { email: desired },
      })
      if (match.userId) {
        await tx.user.update({
          where: { id: match.userId },
          data: { email: desired, clerkUserId: null },
        })
      }
    })

    console.log(`[updated]   ${match.fullName}: ${current || '<none>'} → ${desired}`)
    summary.updated++
  }

  console.log('\n' + '═'.repeat(60))
  console.log('SYNC SUMMARY')
  console.log('═'.repeat(60))
  console.log(`Updated:   ${summary.updated}`)
  console.log(`Unchanged: ${summary.unchanged}`)
  console.log(`Unmatched: ${summary.unmatched.length}`)
  summary.unmatched.forEach((n) => console.log(`  - ${n}`))
  console.log(`Conflicts: ${summary.conflicts.length}`)
  summary.conflicts.forEach((c) => console.log(`  - ${c.row.name} → ${c.row.email} (conflicts with ${c.conflict})`))

  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })

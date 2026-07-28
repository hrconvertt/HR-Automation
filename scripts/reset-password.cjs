/* eslint-disable */
/**
 * scripts/reset-password.cjs
 *
 * One-shot password reset for the emergency JWT login (/sign-in).
 *
 * Usage:
 *   node scripts/reset-password.cjs <email> <new-password>
 *
 * Example:
 *   node scripts/reset-password.cjs hr@convertt.co Convertt2026
 *
 * Bcrypts the new password and writes it to User.password. Doesn't
 * touch Clerk — Clerk passwords are managed via their dashboard.
 */

const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const email = (process.argv[2] || '').trim().toLowerCase()
const password = process.argv[3] || ''

if (!email || !password) {
  console.error('Usage: node scripts/reset-password.cjs <email> <new-password>')
  process.exit(1)
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.')
  process.exit(1)
}

async function main() {
  const prisma = new PrismaClient()
  // Wake Neon if cold.
  for (let i = 0; i < 5; i++) {
    try { await prisma.$queryRaw`SELECT 1`; break }
    catch { await new Promise((r) => setTimeout(r, 2000)) }
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  })
  if (!user) {
    console.error(`No User found for ${email}.`)
    console.error('All users currently in the DB:')
    const all = await prisma.user.findMany({
      select: { email: true, role: true, isActive: true },
      orderBy: { email: 'asc' },
    })
    all.forEach((u) => console.error(`  - ${u.email}  (${u.role}, active=${u.isActive})`))
    await prisma.$disconnect()
    process.exit(2)
  }

  const hash = await bcrypt.hash(password, 12)
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hash, isActive: true },
  })

  console.log(`Password reset for ${email}.`)
  console.log('You can now sign in at /sign-in with that email + the password you just set.')
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })

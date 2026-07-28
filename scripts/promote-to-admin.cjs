/* eslint-disable */
/**
 * scripts/promote-to-admin.cjs
 *
 * Bootstrap an HR_ADMIN role for a specific email. Use this if the Clerk
 * email doesn't match the seeded DB email and you ended up as EMPLOYEE
 * after first sign-in.
 *
 * Run locally with DATABASE_URL pointing at production:
 *
 *   node scripts/promote-to-admin.cjs hr@convertt.co
 *
 * Idempotent — safe to re-run. Reports what it changed.
 */

const { PrismaClient } = require('@prisma/client')

const email = (process.argv[2] || '').trim().toLowerCase()
if (!email || !email.includes('@')) {
  console.error('Usage: node scripts/promote-to-admin.cjs <email>')
  process.exit(1)
}

async function main() {
  const prisma = new PrismaClient()
  // Wake Neon if cold.
  for (let i = 0; i < 5; i++) {
    try { await prisma.$queryRaw`SELECT 1`; break }
    catch { await new Promise((r) => setTimeout(r, 2000)) }
  }

  const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } })
  if (!user) {
    console.error(`No User found for ${email}. Did you mean a different email?`)
    console.error('All admin emails currently in the DB:')
    const admins = await prisma.user.findMany({
      where: { role: 'HR_ADMIN' },
      select: { email: true, clerkUserId: true },
    })
    admins.forEach((a) => console.error(`  - ${a.email} (linked=${!!a.clerkUserId})`))
    process.exit(2)
  }

  if (user.role === 'HR_ADMIN') {
    console.log(`${email} is already HR_ADMIN. Nothing to do.`)
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: { role: 'HR_ADMIN', isActive: true },
    })
    console.log(`Promoted ${email} from ${user.role} → HR_ADMIN.`)
  }

  // Make sure they're active.
  if (!user.isActive) {
    await prisma.user.update({ where: { id: user.id }, data: { isActive: true } })
    console.log(`Reactivated ${email}.`)
  }

  console.log('\nDone. Sign in via Clerk now — webhook will link clerkUserId if not already.')
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })

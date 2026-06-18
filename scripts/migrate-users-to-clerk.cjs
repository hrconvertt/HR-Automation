/* eslint-disable */
/**
 * One-time migration: invite all existing active users into Clerk.
 *
 * Usage:
 *   DATABASE_URL=... CLERK_SECRET_KEY=... node scripts/migrate-users-to-clerk.cjs
 *
 * Idempotent — users with clerkUserId set are skipped. Safe to re-run.
 */
const { PrismaClient } = require('@prisma/client')

async function main() {
  const { createClerkClient } = await import('@clerk/backend')
  if (!process.env.CLERK_SECRET_KEY) {
    console.error('CLERK_SECRET_KEY is required')
    process.exit(1)
  }
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
  const prisma = new PrismaClient()

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  const users = await prisma.user.findMany({
    where: { isActive: true, clerkUserId: null },
    select: {
      id: true,
      email: true,
      employee: { select: { fullName: true } },
    },
    orderBy: { email: 'asc' },
  })

  console.log(`Found ${users.length} active user(s) to invite.`)
  console.log('═'.repeat(70))

  let invited = 0
  let skipped = 0
  let failed = 0
  for (const u of users) {
    const name = u.employee?.fullName ?? u.email
    try {
      const invite = await clerk.invitations.createInvitation({
        emailAddress: u.email,
        redirectUrl: `${baseUrl}/dashboard`,
        notify: true,
        ignoreExisting: true,
      })
      console.log(`${name.padEnd(30)}  INVITED   (${invite.id})`)
      invited++
    } catch (err) {
      const msg = err && err.errors && err.errors[0] && err.errors[0].message
        ? err.errors[0].message
        : (err && err.message) || String(err)
      // "already exists" treated as skip
      if (/exist/i.test(msg)) {
        console.log(`${name.padEnd(30)}  ALREADY INVITED — ${msg}`)
        skipped++
      } else {
        console.error(`${name.padEnd(30)}  ERROR     — ${msg}`)
        failed++
      }
    }
  }

  // Re-scan and report linked
  const linked = await prisma.user.count({ where: { clerkUserId: { not: null } } })
  console.log('═'.repeat(70))
  console.log(`Invited: ${invited}   Skipped: ${skipped}   Failed: ${failed}`)
  console.log(`Total users now linked to Clerk: ${linked}`)
  console.log('\nWhen recipients accept the invite, the webhook (user.created)')
  console.log('will populate User.clerkUserId automatically.')

  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })

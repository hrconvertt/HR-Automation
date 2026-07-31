/**
 * Neon → Supabase data migration (Prisma-native, no pg_dump needed).
 *
 * Prereqs:
 *   1. .env.local has both:
 *        DATABASE_URL="<neon ...>"                (source, read-only)
 *        SUPABASE_DATABASE_URL="<supabase ...>"   (target)
 *   2. Schema already pushed to Supabase:
 *        DATABASE_URL="$SUPABASE_DATABASE_URL" npx prisma db push
 *      (the runner script does this automatically before copying)
 *
 * What it does:
 *   - Connects a Prisma client to Neon and another to Supabase.
 *   - Copies every model's rows Neon→Supabase in batches.
 *   - Relaxes FK enforcement on the target during load
 *     (SET session_replication_role = replica) so insertion order
 *     doesn't matter, then restores it.
 *   - Prints a row-count comparison per model at the end. Counts MUST match.
 *
 * Safe: only READS from Neon. Never writes to or deletes from the source.
 */
const { PrismaClient } = require('@prisma/client')

const NEON = process.env.DATABASE_URL
const SUPA = process.env.SUPABASE_DATABASE_URL
if (!NEON || !SUPA) {
  console.error('Missing DATABASE_URL (Neon) or SUPABASE_DATABASE_URL in env.')
  process.exit(1)
}

const src = new PrismaClient({ datasources: { db: { url: NEON } } })
const dst = new PrismaClient({ datasources: { db: { url: SUPA } } })

// Delegate names are derived at runtime from the Prisma client so we never
// drift from the schema — every model gets copied, in FK-relaxed mode.
const MODEL_DELEGATES = Object.keys(src).filter(
  (k) => !k.startsWith('_') && !k.startsWith('$') && typeof src[k]?.findMany === 'function',
)

const BATCH = 500

async function copyModel(name) {
  const rows = await src[name].findMany()
  if (rows.length === 0) return { name, copied: 0, source: 0 }
  let copied = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const res = await dst[name].createMany({ data: chunk, skipDuplicates: true })
    copied += res.count
  }
  return { name, copied, source: rows.length }
}

async function main() {
  console.log(`Models to copy: ${MODEL_DELEGATES.length}`)
  // Relax FK enforcement on the target for the load.
  await dst.$executeRawUnsafe(`SET session_replication_role = 'replica'`)

  const results = []
  for (const name of MODEL_DELEGATES) {
    try {
      const r = await copyModel(name)
      results.push(r)
      console.log(`  ${name}: ${r.copied}/${r.source}`)
    } catch (e) {
      results.push({ name, error: e.message })
      console.log(`  ${name}: ERROR ${e.message}`)
    }
  }

  await dst.$executeRawUnsafe(`SET session_replication_role = 'origin'`)

  // Verification pass — independent counts on both sides.
  console.log('\n=== VERIFICATION (Neon vs Supabase) ===')
  let mismatches = 0
  for (const name of MODEL_DELEGATES) {
    try {
      const [a, b] = await Promise.all([src[name].count(), dst[name].count()])
      const ok = a === b
      if (!ok) mismatches++
      console.log(`  ${ok ? 'OK ' : 'XX '} ${name}: neon=${a} supabase=${b}`)
    } catch (e) {
      console.log(`  ?? ${name}: count failed ${e.message}`)
    }
  }
  console.log(mismatches === 0 ? '\nALL TABLES MATCH ✅' : `\n${mismatches} TABLE(S) MISMATCH ❌`)

  await src.$disconnect()
  await dst.$disconnect()
  process.exit(mismatches === 0 ? 0 : 2)
}

main().catch(async (e) => {
  console.error(e)
  await src.$disconnect().catch(() => {})
  await dst.$disconnect().catch(() => {})
  process.exit(1)
})

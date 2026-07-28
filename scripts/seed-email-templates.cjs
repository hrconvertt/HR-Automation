/**
 * Seed all 67 email templates from src/lib/email-template-library.json.
 * Idempotent — re-runs upsert by template_id (used as both EmailTemplate.id and key).
 *
 * Usage:
 *   node scripts/seed-email-templates.cjs
 */

const path = require('path')
const fs = require('fs')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

// Per user request, these templates exist but should NOT auto-fire (active=false).
const PARKED_TEMPLATE_IDS = new Set([
  'REC-05', // Reference check
  'ONB-05', // System access
  'ONB-06', // Equipment
  'ONB-07', // Buddy
  'ONB-08', // Orientation
  'ONB-09', // Handbook ack
  'ONB-10', // Probation period intro
  'ONB-11', // 30/60/90 check-in
])

async function main() {
  const libPath = path.join(__dirname, '..', 'src', 'lib', 'email-template-library.json')
  const raw = fs.readFileSync(libPath, 'utf8')
  const lib = JSON.parse(raw)
  const templates = lib.templates || []

  console.log(`[seed] Loading ${templates.length} templates from email-template-library.json`)

  const byCat = {}
  let inserted = 0
  let updated = 0
  let parked = 0

  for (const t of templates) {
    const id = t.template_id
    const isParked = PARKED_TEMPLATE_IDS.has(id)
    if (isParked) parked++

    const data = {
      key: id, // unique
      category: t.category || null,
      name: t.name || null,
      triggerEvent: t.trigger_event || null,
      condition: t.condition && t.condition !== 'always' ? t.condition : null,
      delay: t.delay || null,
      channel: t.channel || 'email',
      manualReview: Boolean(t.manual_review),
      guards: t.guards && t.guards.length ? JSON.stringify(t.guards) : null,
      active: !isParked,
      subject: t.subject || '',
      body: t.body || '',
      description: `[${t.category}] ${t.name}`,
      variables: t.variables ? JSON.stringify(t.variables) : null,
    }

    const existing = await prisma.emailTemplate.findUnique({ where: { id } })
    if (existing) {
      await prisma.emailTemplate.update({
        where: { id },
        // Preserve user-edited subject/body/active on re-runs
        data: {
          category: data.category,
          name: data.name,
          triggerEvent: data.triggerEvent,
          condition: data.condition,
          delay: data.delay,
          channel: data.channel,
          manualReview: data.manualReview,
          guards: data.guards,
          description: data.description,
          variables: data.variables,
        },
      })
      updated++
    } else {
      // Need to upsert by key too in case a row already exists with this key (legacy)
      await prisma.emailTemplate.upsert({
        where: { key: id },
        update: { id, ...data },
        create: { id, ...data },
      })
      inserted++
    }

    byCat[t.category] = (byCat[t.category] || 0) + 1
  }

  console.log(`[seed] inserted=${inserted} updated=${updated} parked(inactive)=${parked}`)
  console.log('[seed] per-category breakdown:')
  for (const [c, n] of Object.entries(byCat)) console.log(`  ${c.padEnd(28)} ${n}`)
}

main()
  .catch((e) => {
    console.error('[seed] failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

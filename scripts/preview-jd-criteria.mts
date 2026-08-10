/**
 * What the JD reader proposes for every published job description.
 *
 * Read-only — it writes nothing. Run it after touching the vocabulary in
 * src/lib/jd-criteria.ts to see what changed across the real JDs rather than
 * guessing:
 *
 *   npx tsx scripts/preview-jd-criteria.mts
 */
import { config } from 'dotenv'
// override, because ESM hoists the Prisma import above this line and Prisma
// auto-loads `.env` — which still holds a stale `file:./dev.db` URL.
config({ path: '.env.local', override: true })

import { PrismaClient } from '@prisma/client'
import { extractCriteriaFromJd } from '../src/lib/jd-criteria'

const p = new PrismaClient()

const reqs = await p.jobRequisition.findMany({
  where: { jdContent: { not: null } },
  select: { title: true, jdContent: true },
  orderBy: { createdAt: 'desc' },
})

for (const r of reqs) {
  const criteria = extractCriteriaFromJd(r.jdContent ?? '')
  console.log(`\n===== ${r.title} — ${criteria.length} suggested =====`)
  for (const c of criteria) {
    console.log(
      `  ${c.isHard ? 'HARD' : 'soft'}  ${c.type.padEnd(14)} ${c.value.padEnd(48)} <- ${c.source}`,
    )
  }
}

await p.$disconnect()

/**
 * Letter numbers — CON-LTR-YYYY-NNN, one after the highest issued this year.
 *
 * Counting the year's letters and adding one breaks as soon as a number is
 * skipped: 29 numbered letters with 030 the highest made the next one 030
 * again, and the unique key refused it. The next number follows the highest
 * instead. Every place that issues a letter number goes through here.
 */
import type { Prisma, PrismaClient } from '@prisma/client'

type Db = PrismaClient | Prisma.TransactionClient

export async function nextLetterNumbers(db: Db, year: number, count = 1): Promise<string[]> {
  const prefix = `CON-LTR-${year}-`
  const issued = await db.letterRequest.findMany({
    where: { letterNumber: { startsWith: prefix } },
    select: { letterNumber: true },
  })
  // Compared as numbers, so 1000 still comes after 999.
  const highest = issued.reduce((max, l) => Math.max(max, Number(l.letterNumber?.slice(prefix.length)) || 0), 0)
  return Array.from({ length: count }, (_, i) => `${prefix}${String(highest + 1 + i).padStart(3, '0')}`)
}

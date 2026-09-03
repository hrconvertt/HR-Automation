/**
 * Recognition, where it is actually needed.
 *
 * Kudos lived on a wall in the culture module and appeared nowhere else — not
 * on the employee's record, not in front of the person writing their appraisal.
 * One kudos was given in three months, which is what a feature that feeds
 * nothing gets used.
 *
 * Praise given in March is evidence in December. These read it back for the
 * two places that need it.
 */
import { prisma } from '@/lib/prisma'

export interface RecognitionItem {
  id: string
  message: string
  valueName: string | null
  fromName: string
  createdAt: Date
}

/** Everything somebody has been given, most recent first. */
export async function recognitionFor(
  employeeId: string, limit = 20,
): Promise<RecognitionItem[]> {
  const rows = await prisma.kudos.findMany({
    where: { toId: employeeId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true, message: true, createdAt: true, category: true,
      from: { select: { fullName: true } },
      value: { select: { name: true } },
    },
  })
  return rows.map((k) => ({
    id: k.id,
    message: k.message,
    // Fall back to the legacy category so rows written before values existed
    // still say something rather than nothing.
    valueName: k.value?.name ?? titleCase(k.category),
    fromName: k.from.fullName,
    createdAt: k.createdAt,
  }))
}

/**
 * What somebody was recognised for inside an assessment period.
 *
 * This is the appraisal's version: an appraiser writing a review should be
 * looking at what colleagues said about this person during the period, not
 * recalling it.
 */
export async function recognitionInPeriod(
  employeeId: string, from: Date, to: Date,
): Promise<RecognitionItem[]> {
  const rows = await prisma.kudos.findMany({
    where: { toId: employeeId, createdAt: { gte: from, lte: to } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, message: true, createdAt: true, category: true,
      from: { select: { fullName: true } },
      value: { select: { name: true } },
    },
  })
  return rows.map((k) => ({
    id: k.id,
    message: k.message,
    valueName: k.value?.name ?? titleCase(k.category),
    fromName: k.from.fullName,
    createdAt: k.createdAt,
  }))
}

/** How often each value has been named, for the culture overview. */
export async function valueCounts(): Promise<{ name: string; count: number }[]> {
  const values = await prisma.recognitionValue.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: 'asc' }],
    select: { name: true, _count: { select: { kudos: true } } },
  })
  return values.map((v) => ({ name: v.name, count: v._count.kudos }))
}

const titleCase = (s: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : ''

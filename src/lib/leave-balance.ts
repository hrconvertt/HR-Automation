/**
 * Spending and returning leave balance.
 *
 * The approve route deducts balance when it approves a request. Nothing else
 * did — so a request created already-APPROVED, which is what marking L on the
 * attendance grid does, took the day off the calendar and left the balance
 * untouched. Four people's balances had drifted under what their approved
 * leave actually came to.
 *
 * Both directions live here so the grid path and any future one cannot
 * disagree about the arithmetic.
 */
import type { Prisma, PrismaClient } from '@prisma/client'

type Db = PrismaClient | Prisma.TransactionClient

/** Work from home spends nothing — same approval path, different consequence. */
export function spendsBalance(category: string): boolean {
  return category !== 'WFH'
}

/**
 * Take `days` off the balance for that type and year. Silent when the employee
 * has no row for the type: a missing balance is not the same as a zero one,
 * and inventing one here would put an allocation on record that HR never set.
 */
export async function spendLeaveBalance(
  db: Db, employeeId: string, leaveType: string, year: number, days: number,
): Promise<boolean> {
  if (days <= 0) return false
  const bal = await db.leaveBalance.findFirst({ where: { employeeId, leaveType, year } })
  if (!bal) return false
  await db.leaveBalance.update({
    where: { id: bal.id },
    data: { used: bal.used + days, remaining: Math.max(0, bal.remaining - days) },
  })
  return true
}

/** Put it back — a cancelled or withdrawn day is not a day taken. */
export async function refundLeaveBalance(
  db: Db, employeeId: string, leaveType: string, year: number, days: number,
): Promise<boolean> {
  if (days <= 0) return false
  const bal = await db.leaveBalance.findFirst({ where: { employeeId, leaveType, year } })
  if (!bal) return false
  await db.leaveBalance.update({
    where: { id: bal.id },
    data: {
      used: Math.max(0, bal.used - days),
      // Never hand back more than was allocated, whatever the history says.
      remaining: Math.min(bal.allocated, bal.remaining + days),
    },
  })
  return true
}

/**
 * team-scope — recursive descendant resolution through the reporting chain.
 *
 * A manager's "team" is every employee below them in the org tree —
 * direct reports, their reports, and so on. Used on the Lifecycle page
 * and any other surface where a manager/lead should only see their own
 * branch of the company.
 *
 * HR_ADMIN / EXECUTIVE bypass this helper entirely (they see everyone).
 */
import { prisma } from '@/lib/prisma'

const EXCLUDED_STATUSES = ['RESIGNED', 'TERMINATED', 'INACTIVE'] as const

export async function getTeamEmployeeIds(
  managerEmployeeId: string,
  options?: { includeSelf?: boolean }
): Promise<string[]> {
  const seen = new Set<string>()
  const result: string[] = []
  if (options?.includeSelf) {
    seen.add(managerEmployeeId)
    result.push(managerEmployeeId)
  }
  let frontier: string[] = [managerEmployeeId]
  while (frontier.length) {
    const reports = await prisma.employee.findMany({
      where: {
        reportingManagerId: { in: frontier },
        status: { notIn: [...EXCLUDED_STATUSES] },
      },
      select: { id: true },
    })
    const next: string[] = []
    for (const r of reports) {
      if (seen.has(r.id)) continue // safety guard against bad cycles
      seen.add(r.id)
      result.push(r.id)
      next.push(r.id)
    }
    frontier = next
  }
  return result
}

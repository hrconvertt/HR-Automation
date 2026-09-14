/**
 * Who may run flex teams. Kept out of the route files: a Next route module
 * may only export its handlers.
 */
import { prisma } from '@/lib/prisma'
import type { TalentAccess } from '@/lib/talent'

/** HR, managers and executives create flex teams. */
export function canRunFlexTeams(access: TalentAccess): boolean {
  if (access.isPreviewMode) return false
  return access.actualRole === 'HR_ADMIN' || ['MANAGER', 'EXECUTIVE'].includes(access.effectiveRole)
}

/** A team, and whether the viewer may change it: its host, its creator, or HR. */
export async function flexTeamOwner(access: TalentAccess, id: string) {
  const team = await prisma.flexTeam.findUnique({
    where: { id }, select: { id: true, title: true, hostId: true, createdById: true },
  })
  if (!team) return { team: null, may: false }
  const may = !access.isPreviewMode && (
    access.actualRole === 'HR_ADMIN'
    || team.createdById === access.userId
    || (!!access.employeeId && team.hostId === access.employeeId)
  )
  return { team, may }
}

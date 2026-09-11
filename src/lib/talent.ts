/**
 * Talent access — the one rule every Team Insights and Succession route uses.
 *
 *   See an employee's talent record: HR and executives (anyone), the person
 *   themselves, and their direct reporting manager.
 *   Change it: HR (not while previewing another role) and the direct manager.
 *   Their own interests and development items: the person themselves as well.
 *   Succession plans: HR changes them; HR and executives read them.
 *
 * Resolution is the same as the job-change routes' — actual role gates
 * writes, effective role scopes reads, and an HR admin previewing as another
 * role cannot write anything.
 */
import type { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { parseLocalDate } from '@/lib/date-utils'
import { resolveJobChangeAccess, type JobChangeAccess } from '@/lib/job-changes'

export type TalentAccess = JobChangeAccess

/** For route handlers. */
export function resolveTalentAccess(request: NextRequest): Promise<TalentAccess | null> {
  return resolveJobChangeAccess(request)
}

/** For server pages — the same resolution, read from the request cookies. */
export async function talentViewer(): Promise<TalentAccess | null> {
  const payload = await verifyToken()
  if (!payload) return null
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true, fullName: true } } },
  })
  if (!user) return null
  const c = await cookies()
  const previewRole = user.role === 'HR_ADMIN' ? c.get('hr_preview_role')?.value : undefined
  return {
    userId: user.id,
    actualRole: user.role,
    effectiveRole: previewRole ?? user.role,
    isPreviewMode: user.role === 'HR_ADMIN' && !!previewRole && previewRole !== 'HR_ADMIN',
    employeeId: user.employee?.id ?? null,
    userName: user.employee?.fullName ?? user.email,
  }
}

export function seesEveryone(access: TalentAccess): boolean {
  return access.effectiveRole === 'HR_ADMIN' || access.effectiveRole === 'EXECUTIVE'
}

async function isDirectManagerOf(access: TalentAccess, employeeId: string): Promise<boolean> {
  if (!access.employeeId) return false
  const e = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { reportingManagerId: true },
  })
  return !!e && e.reportingManagerId === access.employeeId
}

export async function canSeeTalent(access: TalentAccess, employeeId: string): Promise<boolean> {
  if (seesEveryone(access)) return true
  if (access.employeeId === employeeId) return true
  return isDirectManagerOf(access, employeeId)
}

export async function canManageTalent(access: TalentAccess, employeeId: string): Promise<boolean> {
  if (access.isPreviewMode) return false
  if (access.actualRole === 'HR_ADMIN') return true
  return isDirectManagerOf(access, employeeId)
}

/** Interests and development items: the manager's, HR's, and the person's own. */
export async function canEditGrowth(access: TalentAccess, employeeId: string): Promise<boolean> {
  if (!access.isPreviewMode && access.employeeId === employeeId) return true
  return canManageTalent(access, employeeId)
}

export function canManageSuccession(access: TalentAccess): boolean {
  return access.actualRole === 'HR_ADMIN' && !access.isPreviewMode
}

export function canSeeSuccession(access: TalentAccess): boolean {
  return seesEveryone(access)
}

/** A calendar day from "YYYY-MM-DD", at local midnight like the rest of the app. */
export function parseDay(v: unknown): Date | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) return null
  const d = parseLocalDate(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatDay(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

/** Trimmed, length-capped text, or null when empty. */
export function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

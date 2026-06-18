import bcrypt from 'bcryptjs'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { syncClerkUser } from '@/lib/clerk-sync'

/**
 * Canonical role list. Every other module reads from this — don't add
 * new roles by raw string elsewhere.
 *
 *   HR_ADMIN  — full system access, salary writes, payroll approve
 *   MANAGER   — sees own direct reports, approves leaves, requests hires
 *   EMPLOYEE  — self-service (own pay, leave, attendance)
 *   EXECUTIVE — strategic KPIs + read-only org-wide views, no destructive writes
 *   FINANCE   — payroll + banking
 *   LEAD      — team lead (subset of manager perms)
 */
export const ROLES = {
  HR_ADMIN: 'HR_ADMIN',
  MANAGER: 'MANAGER',
  EMPLOYEE: 'EMPLOYEE',
  EXECUTIVE: 'EXECUTIVE',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

// ─── Bcrypt helpers ─────────────────────────────────────────────────────────
// DEPRECATED — kept for legacy scripts that still hash passwords.
// Clerk owns authentication now; do not use these in new code.
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

// ─── Auth payload ───────────────────────────────────────────────────────────

export interface AuthPayload {
  userId: string
  role: string
  roles: string[]
  employeeId?: string
}

/**
 * Bridge from Clerk's session to the existing AuthPayload shape used by ~190
 * route files. The argument (legacy `hr_token` cookie value) is ignored — Clerk
 * is now the source of truth — but kept so we don't have to touch every call
 * site.
 *
 * Now async: `auth()` from Clerk is async in App Router because the request
 * scope is async. Every existing call site has been updated to `await`.
 */
export async function verifyToken(_unused?: string | null): Promise<AuthPayload | null> {
  let clerkUserId: string | null = null
  try {
    const session = await auth()
    clerkUserId = session.userId
  } catch {
    return null
  }
  if (!clerkUserId) return null

  let user = await prisma.user.findUnique({
    where: { clerkUserId },
    include: {
      userRoles: { select: { role: true } },
      employee: { select: { id: true } },
    },
  })

  // Defensive: signed in to Clerk but no DB row yet. Webhook usually creates
  // it, but on first sign-in there can be a race. Sync once and retry.
  if (!user) {
    try {
      await syncClerkUser(clerkUserId)
    } catch {
      return null
    }
    user = await prisma.user.findUnique({
      where: { clerkUserId },
      include: {
        userRoles: { select: { role: true } },
        employee: { select: { id: true } },
      },
    })
  }
  if (!user) return null
  if (!user.isActive) return null

  const extra = user.userRoles.map((r) => r.role)
  const dedup = Array.from(new Set([user.role, ...extra]))
  return {
    userId: user.id,
    role: user.role,
    roles: dedup,
    employeeId: user.employee?.id,
  }
}

/**
 * DEPRECATED — token creation now handled entirely by Clerk. Kept as a no-op
 * stub so any leftover import compiles.
 */
export function createToken(_payload: {
  userId: string
  role: string
  roles?: string[]
  employeeId?: string
}): string {
  return ''
}

// ─── Multi-role helpers ─────────────────────────────────────────────────────

/** Does this user have a specific role? */
export function hasRole(payload: AuthPayload | null, role: string): boolean {
  if (!payload) return false
  return payload.roles.includes(role)
}

/** Does this user have any of the specified roles? */
export function hasAnyRole(payload: AuthPayload | null, roles: string[]): boolean {
  if (!payload) return false
  return roles.some((r) => payload.roles.includes(r))
}

/**
 * "Can perform action" check.
 * Combines: (1) user has the required role AND (2) is currently viewing in that role.
 * The second condition prevents HR-previewing-as-Employee from accidentally
 * triggering HR actions even though they have the underlying permission.
 */
export function canAct(
  payload: AuthPayload | null,
  required: string | string[],
  effectiveRole: string,
): boolean {
  if (!payload) return false
  const requiredArr = Array.isArray(required) ? required : [required]
  if (!requiredArr.some((r) => payload.roles.includes(r))) return false
  if (!requiredArr.includes(effectiveRole)) return false
  return true
}

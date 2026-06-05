import bcrypt from 'bcryptjs'
import crypto from 'crypto'

/**
 * Canonical role list. Every other module reads from this — don't add
 * new roles by raw string elsewhere.
 *
 *   HR_ADMIN  — full system access, salary writes, payroll approve
 *   MANAGER   — sees own direct reports, approves leaves, requests hires
 *   EMPLOYEE  — self-service (own pay, leave, attendance)
 *   EXECUTIVE — strategic KPIs + read-only org-wide views, no destructive writes
 */
export const ROLES = {
  HR_ADMIN: 'HR_ADMIN',
  MANAGER: 'MANAGER',
  EMPLOYEE: 'EMPLOYEE',
  EXECUTIVE: 'EXECUTIVE',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

// Fail closed in production — never fall back to a hard-coded default secret
// in a deployed environment. Dev keeps a deterministic fallback so the app
// still boots without a .env file.
const JWT_SECRET = (() => {
  const fromEnv = process.env.JWT_SECRET
  if (fromEnv && fromEnv.length >= 16) return fromEnv
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'JWT_SECRET environment variable is missing or too short (need ≥16 chars). ' +
      'Refusing to start in production without a strong secret.',
    )
  }
  return 'convertt-hr-dev-only-secret-not-for-production'
})()

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function base64UrlDecode(str: string): string {
  const padded = str + '==='.slice((str.length + 3) % 4)
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
}

function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url')
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function createToken(payload: {
  userId: string
  role: string         // primary role (default view)
  roles?: string[]     // full role set (multi-role support)
  employeeId?: string
}): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64UrlEncode(
    JSON.stringify({
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 days
    })
  )
  const signature = sign(`${header}.${body}`, JWT_SECRET)
  return `${header}.${body}.${signature}`
}

export function verifyToken(
  token: string
): { userId: string; role: string; roles: string[]; employeeId?: string } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [header, body, signature] = parts
    const expectedSig = sign(`${header}.${body}`, JWT_SECRET)
    if (signature !== expectedSig) return null

    const decoded = JSON.parse(base64UrlDecode(body)) as {
      userId: string
      role: string
      roles?: string[]
      employeeId?: string
      exp: number
    }

    if (decoded.exp < Math.floor(Date.now() / 1000)) return null

    // Backwards-compat: if no roles array in token, derive from primary
    const roles = decoded.roles && decoded.roles.length > 0
      ? decoded.roles
      : [decoded.role]

    return {
      userId: decoded.userId,
      role: decoded.role,
      roles,
      employeeId: decoded.employeeId,
    }
  } catch {
    return null
  }
}

// ─── Multi-role helpers ─────────────────────────────────────────────────────

export interface AuthPayload {
  userId: string
  role: string
  roles: string[]
  employeeId?: string
}

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
 *
 * @param payload  decoded JWT
 * @param required role required for the action (or array of acceptable roles)
 * @param effectiveRole the user's current view (from preview cookie or primary)
 */
export function canAct(
  payload: AuthPayload | null,
  required: string | string[],
  effectiveRole: string,
): boolean {
  if (!payload) return false
  const requiredArr = Array.isArray(required) ? required : [required]
  // Must HAVE the role
  if (!requiredArr.some((r) => payload.roles.includes(r))) return false
  // Must be currently VIEWING in one of those roles
  if (!requiredArr.includes(effectiveRole)) return false
  return true
}

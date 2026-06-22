import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { cookies } from 'next/headers'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { syncClerkUser } from '@/lib/clerk-sync'

/**
 * Canonical role list.
 */
export const ROLES = {
  HR_ADMIN: 'HR_ADMIN',
  MANAGER: 'MANAGER',
  EMPLOYEE: 'EMPLOYEE',
  EXECUTIVE: 'EXECUTIVE',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

// ─── Bcrypt helpers (used by the emergency JWT login) ───────────────────────
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

// ─── Emergency JWT (the "Path A" bypass — works when Clerk is misbehaving) ──
// Set on POST /api/auth/emergency-signin. Read here as a fallback when Clerk
// has no active session. Lets HR sign in with email + password against the
// bcrypt hash already stored in User.password.
//
// Cookie name `hr_token` matches the original (pre-Clerk) cookie so any
// leftover code paths that referenced it continue to work.

const JWT_SECRET = (() => {
  const fromEnv = process.env.JWT_SECRET
  if (fromEnv && fromEnv.length >= 16) return fromEnv
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET missing or too short (≥16 chars).')
  }
  return 'convertt-hr-dev-only-secret-not-for-production'
})()

function b64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64UrlDecode(str: string): string {
  const padded = str + '==='.slice((str.length + 3) % 4)
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
}

interface JwtPayload {
  userId: string
  role: string
  exp: number
}

export function signEmergencyJwt(payload: { userId: string; role: string }, ttlSec = 7 * 24 * 60 * 60): string {
  const header = b64UrlEncode(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const body = b64UrlEncode(
    Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSec })),
  )
  const sig = b64UrlEncode(
    crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest(),
  )
  return `${header}.${body}.${sig}`
}

function verifyEmergencyJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const expected = b64UrlEncode(
      crypto.createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest(),
    )
    if (expected !== parts[2]) return null
    const decoded = JSON.parse(b64UrlDecode(parts[1])) as JwtPayload
    if (decoded.exp < Math.floor(Date.now() / 1000)) return null
    return decoded
  } catch {
    return null
  }
}

// ─── Auth payload ───────────────────────────────────────────────────────────

export interface AuthPayload {
  userId: string
  role: string
  roles: string[]
  employeeId?: string
}

/**
 * Two-source auth bridge.
 *
 *   1. Try Clerk's session first (primary path).
 *   2. If no Clerk session, try the `hr_token` emergency JWT cookie
 *      (set by /api/auth/emergency-signin — HR's bypass).
 *
 * Returns null if neither yields a valid User row.
 */
export async function verifyToken(_unused?: string | null): Promise<AuthPayload | null> {
  // ── 1. Clerk path ──────────────────────────────────────────────────────
  let clerkUserId: string | null = null
  try {
    const session = await auth()
    clerkUserId = session.userId
  } catch {
    clerkUserId = null
  }

  if (clerkUserId) {
    let user = await prisma.user.findUnique({
      where: { clerkUserId },
      include: {
        userRoles: { select: { role: true } },
        employee: { select: { id: true } },
      },
    })
    if (!user) {
      try { await syncClerkUser(clerkUserId) } catch { /* fall through */ }
      user = await prisma.user.findUnique({
        where: { clerkUserId },
        include: {
          userRoles: { select: { role: true } },
          employee: { select: { id: true } },
        },
      })
    }
    if (user && user.isActive) {
      const extra = user.userRoles.map((r) => r.role)
      const dedup = Array.from(new Set([user.role, ...extra]))
      return { userId: user.id, role: user.role, roles: dedup, employeeId: user.employee?.id }
    }
  }

  // ── 2. Emergency JWT fallback ──────────────────────────────────────────
  try {
    const cookieStore = await cookies()
    const tok = cookieStore.get('hr_token')?.value
    if (tok) {
      const payload = verifyEmergencyJwt(tok)
      if (payload) {
        const user = await prisma.user.findUnique({
          where: { id: payload.userId },
          include: {
            userRoles: { select: { role: true } },
            employee: { select: { id: true } },
          },
        })
        if (user && user.isActive) {
          const extra = user.userRoles.map((r) => r.role)
          const dedup = Array.from(new Set([user.role, ...extra]))
          return { userId: user.id, role: user.role, roles: dedup, employeeId: user.employee?.id }
        }
      }
    }
  } catch {
    // cookies() can throw in some contexts; treat as "no fallback"
  }

  return null
}

/**
 * DEPRECATED — token creation now handled entirely by Clerk (or the emergency
 * JWT for HR). Kept as a no-op so any leftover import compiles.
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

export function hasRole(payload: AuthPayload | null, role: string): boolean {
  if (!payload) return false
  return payload.roles.includes(role)
}

export function hasAnyRole(payload: AuthPayload | null, roles: string[]): boolean {
  if (!payload) return false
  return roles.some((r) => payload.roles.includes(r))
}

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

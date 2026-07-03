/**
 * POST /api/auth/set-password — PUBLIC (middleware allowlist).
 *
 * Body: { token, password }
 * Validates a one-time invite token (SHA-256 hash lookup, unexpired, unused),
 * enforces the password policy, bcrypt-hashes the password onto the User row
 * (creating + linking one if the employee has none), marks the token used,
 * and signs the caller in via the hr_token emergency JWT cookie.
 *
 * Rate-limited per IP: max 10 attempts per hour (in-memory).
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword, signEmergencyJwt } from '@/lib/auth'
import { hashInviteToken } from '@/lib/login-invites'

export const runtime = 'nodejs'

// ─── Simple in-memory per-IP rate limit ─────────────────────────────────────
const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
const attempts = new Map<string, { count: number; windowStart: number }>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = attempts.get(ip)
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    attempts.set(ip, { count: 1, windowStart: now })
    return false
  }
  entry.count += 1
  return entry.count > RATE_LIMIT_MAX
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}

function passwordPolicyError(password: string): string | null {
  if (password.length < 10) return 'Password must be at least 10 characters.'
  if (!/[a-zA-Z]/.test(password)) return 'Password must contain at least one letter.'
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number.'
  return null
}

const EXPIRED_MSG = 'This link has expired or was already used. Ask HR to send a new one.'

export async function POST(req: NextRequest) {
  if (rateLimited(clientIp(req))) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again later.' },
      { status: 429 },
    )
  }

  let body: { token?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const rawToken = String(body.token ?? '').trim()
  const password = String(body.password ?? '')
  if (!rawToken || !password) {
    return NextResponse.json({ error: 'Token and password are required.' }, { status: 400 })
  }

  const policyError = passwordPolicyError(password)
  if (policyError) return NextResponse.json({ error: policyError }, { status: 400 })

  // Hash lookup — the raw token is never stored or logged.
  const invite = await prisma.inviteToken.findUnique({
    where: { tokenHash: hashInviteToken(rawToken) },
    select: {
      id: true,
      expiresAt: true,
      usedAt: true,
      employee: {
        select: {
          id: true,
          email: true,
          userId: true,
          user: { select: { id: true, role: true } },
        },
      },
    },
  })
  if (!invite || invite.usedAt || invite.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: EXPIRED_MSG }, { status: 410 })
  }

  const employee = invite.employee
  const hashed = await hashPassword(password)

  let userId: string
  let role: string
  if (employee.user) {
    // Existing login — set/replace the password.
    const updated = await prisma.user.update({
      where: { id: employee.user.id },
      data: { password: hashed, mustChangePass: false, isActive: true, lastLogin: new Date() },
      select: { id: true, role: true },
    })
    userId = updated.id
    role = updated.role
  } else {
    // No User row yet. Link an existing unattached row by email if present,
    // otherwise create a fresh one with the default EMPLOYEE role.
    const email = employee.email.toLowerCase()
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } })
    if (existing) {
      const [updated] = await prisma.$transaction([
        prisma.user.update({
          where: { id: existing.id },
          data: { password: hashed, mustChangePass: false, isActive: true, lastLogin: new Date() },
          select: { id: true, role: true },
        }),
        prisma.employee.update({
          where: { id: employee.id },
          data: { userId: existing.id },
        }),
      ])
      userId = updated.id
      role = updated.role
    } else {
      const created = await prisma.user.create({
        data: {
          email,
          password: hashed,
          role: 'EMPLOYEE',
          mustChangePass: false,
          isActive: true,
          lastLogin: new Date(),
          userRoles: { create: { role: 'EMPLOYEE' } },
          employee: { connect: { id: employee.id } },
        },
        select: { id: true, role: true },
      })
      userId = created.id
      role = created.role
    }
  }

  // Single use — mark consumed.
  await prisma.inviteToken.update({
    where: { id: invite.id },
    data: { usedAt: new Date() },
  })

  // Sign them in via the existing emergency-JWT cookie.
  const jwt = signEmergencyJwt({ userId, role })
  const res = NextResponse.json({ ok: true, redirectTo: '/dashboard' })
  res.cookies.set('hr_token', jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  })
  return res
}

/**
 * Per-user actions: change role, reset password, reset MFA, lock,
 * deactivate. HR_ADMIN only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { clerkClient } from '@clerk/nextjs/server'

export const runtime = 'nodejs'

type Action =
  | { action: 'change-role'; primaryRole: string; additionalRoles?: string[] }
  | { action: 'change-email'; email: string }
  | { action: 'reset-password' }
  | { action: 'reset-mfa' }
  | { action: 'lock' }
  | { action: 'deactivate' }
  | { action: 'reactivate' }

export async function POST(req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  const payload = await verifyToken()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Forbidden — HR only' }, { status: 403 })
  }

  const { userId } = await ctx.params
  const body = (await req.json()) as Action

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const client = await clerkClient()

  try {
    switch (body.action) {
      case 'change-role': {
        await prisma.$transaction(async (tx) => {
          await tx.user.update({ where: { id: userId }, data: { role: body.primaryRole } })
          await tx.userRole.deleteMany({ where: { userId } })
          const extras = (body.additionalRoles ?? []).filter((r) => r !== body.primaryRole)
          if (extras.length > 0) {
            await tx.userRole.createMany({
              data: extras.map((r) => ({ userId, role: r, assignedBy: payload.userId })),
            })
          }
        })
        return NextResponse.json({ ok: true })
      }
      case 'change-email': {
        const newEmail = String(body.email ?? '').trim().toLowerCase()
        if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
          return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
        }
        if (newEmail === user.email.toLowerCase()) {
          return NextResponse.json({ ok: true, message: 'No change' })
        }
        // Conflict: no other User can already have this email
        const conflict = await prisma.user.findUnique({ where: { email: newEmail } })
        if (conflict) {
          return NextResponse.json(
            { error: `That email is already used by another user.` },
            { status: 409 },
          )
        }
        await prisma.$transaction(async (tx) => {
          // Update User + the linked Employee row (if any).
          // Clear clerkUserId so any stale Clerk link is broken — next sign-in
          // will re-link cleanly under the new email.
          await tx.user.update({
            where: { id: userId },
            data: { email: newEmail, clerkUserId: null },
          })
          const emp = await tx.employee.findFirst({ where: { userId } })
          if (emp) {
            await tx.employee.update({ where: { id: emp.id }, data: { email: newEmail } })
          }
        })
        return NextResponse.json({ ok: true, email: newEmail })
      }
      case 'reset-password': {
        if (!user.clerkUserId) {
          return NextResponse.json({ error: 'User not linked to Clerk' }, { status: 400 })
        }
        // Clerk: create a sign-in token / password-reset flow. Easiest is to
        // re-send an invitation, which lets them set a new password.
        await client.invitations.createInvitation({
          emailAddress: user.email,
          ignoreExisting: true,
          notify: true,
        })
        return NextResponse.json({ ok: true, sent: true })
      }
      case 'reset-mfa': {
        if (!user.clerkUserId) {
          return NextResponse.json({ error: 'User not linked to Clerk' }, { status: 400 })
        }
        await client.users.disableUserMFA(user.clerkUserId)
        return NextResponse.json({ ok: true })
      }
      case 'lock': {
        if (!user.clerkUserId) {
          return NextResponse.json({ error: 'User not linked to Clerk' }, { status: 400 })
        }
        // Revoke all sessions
        const sessions = await client.sessions.getSessionList({ userId: user.clerkUserId })
        const list = Array.isArray(sessions) ? sessions : sessions.data
        await Promise.all(list.map((s) => client.sessions.revokeSession(s.id)))
        return NextResponse.json({ ok: true, revoked: list.length })
      }
      case 'deactivate': {
        await prisma.user.update({ where: { id: userId }, data: { isActive: false } })
        if (user.clerkUserId) {
          // Revoke sessions so they can't continue using the app
          try {
            const sessions = await client.sessions.getSessionList({ userId: user.clerkUserId })
            const list = Array.isArray(sessions) ? sessions : sessions.data
            await Promise.all(list.map((s) => client.sessions.revokeSession(s.id)))
          } catch {
            /* ignore */
          }
        }
        return NextResponse.json({ ok: true })
      }
      case 'reactivate': {
        await prisma.user.update({ where: { id: userId }, data: { isActive: true } })
        return NextResponse.json({ ok: true })
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (e) {
    console.error('[users action]', e)
    const message = e instanceof Error ? e.message : 'Action failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

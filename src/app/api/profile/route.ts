import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

/**
 * GET  /api/profile  — return the current user + employee profile
 * PATCH /api/profile — update display name, photo (BYTEA), pronouns
 *
 * Body for PATCH (all optional):
 *   { fullName?, pronouns?, photoBase64?, photoMimeType? }
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  if (!token) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true, email: true, role: true, pronouns: true,
      theme: true, language: true, mustChangePass: true,
      employee: {
        select: {
          id: true, fullName: true, photoUrl: true,
          designation: true, hideBirthday: true, hideAnniversary: true,
          department: { select: { name: true } },
        },
      },
    },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  return NextResponse.json({ user })
}

export async function PATCH(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  if (!token) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  // SECURITY: this endpoint only writes to the caller's own row. We
  // derive userId + employeeId from the verified JWT and ignore any
  // employeeId in the body — employees cannot impersonate others here.
  const body = await request.json().catch(() => ({}))
  const { fullName, pronouns, photoBase64, photoMimeType } = body as {
    fullName?: string
    pronouns?: string | null
    photoBase64?: string
    photoMimeType?: string
  }

  await prisma.user.update({
    where: { id: payload.userId },
    data: {
      ...(pronouns !== undefined ? { pronouns: pronouns || null } : {}),
    },
  })

  if (payload.employeeId && (fullName !== undefined || photoBase64)) {
    const data: { fullName?: string; photoUrl?: string } = {}
    if (fullName) data.fullName = fullName.trim()
    if (photoBase64) {
      // Store as a data URL on photoUrl (existing field). Avoids a new
      // BYTEA migration — Postgres handles long strings fine and the
      // value is read directly by <img src=…/> in the UI.
      const mime = photoMimeType || 'image/png'
      const clean = photoBase64.replace(/^data:[^;]+;base64,/, '')
      data.photoUrl = `data:${mime};base64,${clean}`
    }
    if (Object.keys(data).length > 0) {
      await prisma.employee.update({ where: { id: payload.employeeId }, data })
    }
  }

  return NextResponse.json({ success: true })
}

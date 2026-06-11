import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

/**
 * GET   /api/profile/preferences  — return theme + language + privacy
 * PATCH /api/profile/preferences  — update any/all of them
 *
 * Body:
 *   { theme?, language?, hideBirthday?, hideAnniversary? }
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  if (!token) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      theme: true, language: true,
      employee: { select: { hideBirthday: true, hideAnniversary: true } },
    },
  })
  return NextResponse.json({
    theme: user?.theme ?? 'LIGHT',
    language: user?.language ?? 'EN',
    hideBirthday: user?.employee?.hideBirthday ?? false,
    hideAnniversary: user?.employee?.hideAnniversary ?? false,
  })
}

export async function PATCH(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  if (!token) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { theme, language, hideBirthday, hideAnniversary } = await request.json().catch(() => ({}))

  const userData: { theme?: string; language?: string } = {}
  if (theme && ['LIGHT', 'DARK', 'SYSTEM'].includes(theme)) userData.theme = theme
  if (language && ['EN', 'UR'].includes(language)) userData.language = language
  if (Object.keys(userData).length > 0) {
    await prisma.user.update({ where: { id: payload.userId }, data: userData })
  }

  if (payload.employeeId && (hideBirthday !== undefined || hideAnniversary !== undefined)) {
    await prisma.employee.update({
      where: { id: payload.employeeId },
      data: {
        ...(hideBirthday !== undefined ? { hideBirthday: !!hideBirthday } : {}),
        ...(hideAnniversary !== undefined ? { hideAnniversary: !!hideAnniversary } : {}),
      },
    })
  }
  return NextResponse.json({ success: true })
}

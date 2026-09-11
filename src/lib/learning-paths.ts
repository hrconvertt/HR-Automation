/**
 * Who may do what with a learning path. Server only — it reads the database.
 *
 * The owner does everything. A path set to Everyone can be opened by anyone
 * signed in, but only its owner changes it. HR gets no special power over
 * somebody's path: it is a person's own study plan, not a company record, and
 * the required-learning assignment is how HR puts a course in front of people.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'

export async function pathAccess(pathId: string, employeeId: string | null) {
  const path = await prisma.learningPath.findUnique({
    where: { id: pathId },
    select: { ownerId: true, visibility: true },
  })
  if (!path) return { exists: false, canView: false, isOwner: false }
  const isOwner = !!employeeId && path.ownerId === employeeId
  return { exists: true, isOwner, canView: isOwner || path.visibility === 'EVERYONE' }
}

/** The signed-in person, for reading. */
export async function pathReader(request: NextRequest): Promise<{ employeeId: string } | { error: NextResponse }> {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!payload.employeeId) {
    return { error: NextResponse.json({ error: 'Your account is not linked to an employee record.' }, { status: 400 }) }
  }
  return { employeeId: payload.employeeId }
}

/** The signed-in person, for changing something — refused while HR previews another role. */
export async function pathWriter(request: NextRequest): Promise<{ employeeId: string } | { error: NextResponse }> {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const preview = request.cookies.get('hr_preview_role')?.value
  if (hasRole(payload, 'HR_ADMIN') && preview && preview !== 'HR_ADMIN') {
    return { error: NextResponse.json({ error: 'View-only while previewing another role' }, { status: 403 }) }
  }
  if (!payload.employeeId) {
    return { error: NextResponse.json({ error: 'Your account is not linked to an employee record.' }, { status: 400 }) }
  }
  return { employeeId: payload.employeeId }
}

/** The owner check every change goes through. */
export async function ownPath(pathId: string, employeeId: string): Promise<NextResponse | null> {
  const access = await pathAccess(pathId, employeeId)
  if (!access.exists) return NextResponse.json({ error: 'That path no longer exists' }, { status: 404 })
  if (!access.isOwner) {
    return NextResponse.json({ error: 'Only the person who made this path can change it' }, { status: 403 })
  }
  return null
}

export function cleanTitle(v: unknown): string | null {
  const t = typeof v === 'string' ? v.trim() : ''
  return t ? t.slice(0, 120) : null
}

export function cleanDescription(v: unknown): string | null {
  const t = typeof v === 'string' ? v.trim() : ''
  return t ? t.slice(0, 1000) : null
}

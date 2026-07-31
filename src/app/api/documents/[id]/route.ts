/**
 * PATCH /api/documents/[id]
 *
 * HR-only. Edits a document's own record — used by the eye / hide button and
 * the rename control in the Documents tab on employee profiles.
 *
 *   Body: { visibleToEmployee?: boolean, name?: string, type?: string, expiryDate?: string | null }
 *
 * Every field is optional; only what's sent is written. `type` is validated
 * against the shared catalog so a renamed document can't drop out of the
 * Document Center's filters by acquiring a type nothing filters on.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { DOC_TYPES } from '@/lib/document-types'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true },
  })
  if (!me || me.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Forbidden — HR only' }, { status: 403 })
  }

  let body: {
    visibleToEmployee?: boolean
    name?: string
    type?: string
    expiryDate?: string | null
  } = {}
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const data: {
    visibleToEmployee?: boolean
    name?: string
    type?: string
    expiryDate?: Date | null
  } = {}

  if (body.visibleToEmployee !== undefined) {
    if (typeof body.visibleToEmployee !== 'boolean') {
      return NextResponse.json({ error: 'visibleToEmployee must be boolean' }, { status: 400 })
    }
    data.visibleToEmployee = body.visibleToEmployee
  }

  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
    if (name.length > 200) {
      return NextResponse.json({ error: 'Name is too long (max 200 characters)' }, { status: 400 })
    }
    data.name = name
  }

  if (body.type !== undefined) {
    const type = String(body.type).trim()
    if (!DOC_TYPES.some((t) => t.value === type)) {
      return NextResponse.json({ error: `Unknown document type "${type}"` }, { status: 400 })
    }
    data.type = type
  }

  if (body.expiryDate !== undefined) {
    if (body.expiryDate === null || body.expiryDate === '') {
      data.expiryDate = null
    } else {
      const d = new Date(String(body.expiryDate))
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: 'expiryDate is not a valid date' }, { status: 400 })
      }
      data.expiryDate = d
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const updated = await prisma.employeeDocument.update({
    where: { id },
    data,
    select: { id: true, name: true, type: true, expiryDate: true, visibleToEmployee: true },
  })
  return NextResponse.json({ document: updated })
}

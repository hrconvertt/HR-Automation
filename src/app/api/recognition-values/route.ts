/**
 * The values recognition is given against.
 *
 * Seeded from the four categories that used to be hardcoded. They are
 * placeholders: the real ones are in the HR Playbook, and inventing a
 * company's values is not something software should do.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const values = await prisma.recognitionValue.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, description: true },
  })
  return NextResponse.json({ values })
}

export async function PATCH(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Forbidden — HR only' }, { status: 403 })
  }

  let body: { id?: string; name?: string; description?: string; active?: boolean; create?: boolean } = {}
  try { body = await request.json() } catch { /* validated below */ }

  if (body.create) {
    const name = body.name?.trim().slice(0, 80)
    if (!name) return NextResponse.json({ error: 'A value needs a name.' }, { status: 400 })
    const count = await prisma.recognitionValue.count()
    const created = await prisma.recognitionValue.create({
      data: {
        name,
        description: body.description?.trim().slice(0, 300) || null,
        sortOrder: count,
      },
      select: { id: true },
    }).catch(() => null)
    if (!created) return NextResponse.json({ error: 'That value already exists.' }, { status: 409 })
    return NextResponse.json({ id: created.id })
  }

  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  await prisma.recognitionValue.update({
    where: { id: body.id },
    data: {
      ...(typeof body.name === 'string' && body.name.trim()
        ? { name: body.name.trim().slice(0, 80) } : {}),
      ...(typeof body.description === 'string'
        ? { description: body.description.trim().slice(0, 300) || null } : {}),
      ...(typeof body.active === 'boolean' ? { active: body.active } : {}),
    },
  })
  return NextResponse.json({ ok: true })
}

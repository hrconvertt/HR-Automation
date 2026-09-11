/**
 * PATCH  /api/learning/paths/[id] — rename it, redescribe it, change who sees it.
 * DELETE /api/learning/paths/[id] — delete it. The courses stay; only the list goes.
 *
 * Owner only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { pathWriter, ownPath, cleanTitle, cleanDescription } from '@/lib/learning-paths'
import { PATH_VISIBILITY } from '@/lib/learning-path-types'

interface RouteParams { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const who = await pathWriter(request)
  if ('error' in who) return who.error
  const { id } = await params
  const refused = await ownPath(id, who.employeeId)
  if (refused) return refused

  const body = await request.json().catch(() => ({}))
  const data: { title?: string; description?: string | null; visibility?: string } = {}
  if (body.title !== undefined) {
    const title = cleanTitle(body.title)
    if (!title) return NextResponse.json({ error: 'A path needs a name' }, { status: 400 })
    data.title = title
  }
  if (body.description !== undefined) data.description = cleanDescription(body.description)
  if (body.visibility !== undefined) {
    if (!(PATH_VISIBILITY as readonly string[]).includes(body.visibility)) {
      return NextResponse.json({ error: 'Privacy is Only me or Everyone' }, { status: 400 })
    }
    data.visibility = body.visibility
  }

  const path = await prisma.learningPath.update({
    where: { id },
    data,
    select: { id: true, title: true, description: true, visibility: true },
  })
  return NextResponse.json({ ok: true, path })
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const who = await pathWriter(request)
  if ('error' in who) return who.error
  const { id } = await params
  const refused = await ownPath(id, who.employeeId)
  if (refused) return refused

  // Items cascade with the path.
  await prisma.learningPath.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

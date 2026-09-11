/**
 * POST /api/talent/development-items — add a step to somebody's development.
 * body: { employeeId, title, detail?, skillId?, dueDate?: 'YYYY-MM-DD' }
 *
 * The manager, HR, or the person themselves.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notifications'
import { resolveTalentAccess, canEditGrowth, parseDay, cleanText } from '@/lib/talent'

export async function POST(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as {
    employeeId?: string; title?: string; detail?: string; skillId?: string; dueDate?: string
  }
  const employeeId = typeof body.employeeId === 'string' ? body.employeeId : ''
  const title = cleanText(body.title, 200)
  if (!employeeId || !title) {
    return NextResponse.json({ error: 'Name the development item.' }, { status: 400 })
  }
  if (!(await canEditGrowth(access, employeeId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let skillId: string | null = null
  if (typeof body.skillId === 'string' && body.skillId) {
    const s = await prisma.skill.findUnique({ where: { id: body.skillId }, select: { id: true } })
    if (!s) return NextResponse.json({ error: 'Skill not found' }, { status: 400 })
    skillId = s.id
  }
  const dueDate = body.dueDate ? parseDay(body.dueDate) : null
  if (body.dueDate && !dueDate) return NextResponse.json({ error: 'Invalid due date' }, { status: 400 })

  const item = await prisma.developmentItem.create({
    data: {
      employeeId,
      title,
      detail: cleanText(body.detail, 2000),
      skillId,
      dueDate,
      createdById: access.userId,
    },
    select: { id: true },
  })

  if (access.employeeId !== employeeId) {
    await notify({
      employeeId,
      type: 'GENERAL',
      title: 'New development item',
      message: `${access.userName} added "${title}" to your development plan.`,
    })
  }

  return NextResponse.json({ item }, { status: 201 })
}

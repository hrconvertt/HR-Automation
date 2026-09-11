/**
 * Skill interests — what somebody wants to grow into.
 *
 *   POST   { employeeId, skillName, category? }  (the skill is created if new)
 *   DELETE ?id=
 *
 * The manager, HR, or the person themselves. Skill names match
 * case-insensitively, the same as the Skills page, so an interest and a held
 * skill land on the same Skill row and mentors can be matched against it.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveTalentAccess, canEditGrowth, cleanText } from '@/lib/talent'

export async function POST(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as {
    employeeId?: string; skillName?: string; category?: string
  }
  const employeeId = typeof body.employeeId === 'string' ? body.employeeId : ''
  const name = cleanText(body.skillName, 80)
  if (!employeeId || !name) {
    return NextResponse.json({ error: 'Name the skill.' }, { status: 400 })
  }
  if (!(await canEditGrowth(access, employeeId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const existing = await prisma.skill.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } }, select: { id: true },
  })
  const skill = existing ?? await prisma.skill.create({
    data: { name, category: cleanText(body.category, 60) },
    select: { id: true },
  })

  await prisma.skillInterest.upsert({
    where: { employeeId_skillId: { employeeId, skillId: skill.id } },
    update: {},
    create: { employeeId, skillId: skill.id },
  })
  return NextResponse.json({ ok: true }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const row = await prisma.skillInterest.findUnique({ where: { id }, select: { employeeId: true } })
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await canEditGrowth(access, row.employeeId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  await prisma.skillInterest.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

/**
 * Skills — who knows what.
 *
 *   GET             every skill with who holds it, or ?employeeId= for one person
 *   POST            give somebody a skill (creating the skill if it is new)
 *   DELETE ?id=     take it away
 *
 * Deliberately not a marketplace. The question this answers is "who can cover
 * Shopify while Rayyan is at the university", and that needs a list of names
 * against a capability, not a gig board.
 *
 * HR records anyone's skills, anyone records their own, and a manager records
 * their direct reports' — the manager is who knows how deep a report's skill
 * actually goes, and Team Insights is where they say so.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

export const LEVELS = [
  { value: 1, label: 'Aware' },
  { value: 2, label: 'Working' },
  { value: 3, label: 'Strong' },
  { value: 4, label: 'Can teach it' },
]

/** HR, the person themselves, or their direct reporting manager. */
async function mayRecordFor(
  payload: { userId: string; role: string },
  employeeId: string,
): Promise<boolean> {
  if (payload.role === 'HR_ADMIN' || payload.role === 'EXECUTIVE') return true
  const me = await prisma.employee.findFirst({
    where: { userId: payload.userId }, select: { id: true },
  })
  if (!me) return false
  if (me.id === employeeId) return true
  const target = await prisma.employee.findUnique({
    where: { id: employeeId }, select: { reportingManagerId: true },
  })
  return target?.reportingManagerId === me.id
}

export async function GET(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const employeeId = request.nextUrl.searchParams.get('employeeId')
  if (employeeId) {
    const held = await prisma.employeeSkill.findMany({
      where: { employeeId },
      orderBy: [{ level: 'desc' }, { skill: { name: 'asc' } }],
      select: { id: true, level: true, note: true, skill: { select: { id: true, name: true, category: true } } },
    })
    return NextResponse.json({ held })
  }

  const skills = await prisma.skill.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true, category: true,
      holders: {
        orderBy: { level: 'desc' },
        select: {
          id: true, level: true,
          employee: { select: { id: true, fullName: true, designation: true, status: true } },
        },
      },
    },
  })

  // Somebody who has left is not cover for anything.
  const live = skills.map((s) => ({
    ...s,
    holders: s.holders.filter((h) => h.employee.status === 'ACTIVE'),
  }))
  return NextResponse.json({ skills: live })
}

export async function POST(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { employeeId?: string; skillName?: string; category?: string; level?: number; note?: string } = {}
  try { body = await request.json() } catch { /* validated below */ }

  const name = typeof body.skillName === 'string' ? body.skillName.trim().slice(0, 80) : ''
  if (!body.employeeId || !name) {
    return NextResponse.json({ error: 'employeeId and skillName are required' }, { status: 400 })
  }

  if (!(await mayRecordFor(payload, body.employeeId))) {
    return NextResponse.json(
      { error: 'You can only record skills for yourself or your direct reports.' },
      { status: 403 },
    )
  }

  // Case-insensitive match, so "Shopify" and "shopify" do not become two
  // skills with one holder each — which is how a skills list stops answering
  // the question it exists for.
  const existing = await prisma.skill.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } }, select: { id: true },
  })
  const skill = existing ?? await prisma.skill.create({
    data: {
      name,
      category: typeof body.category === 'string' && body.category.trim()
        ? body.category.trim().slice(0, 60) : null,
    },
    select: { id: true },
  })

  const level = typeof body.level === 'number' && [1, 2, 3, 4].includes(body.level)
    ? body.level : 2

  await prisma.employeeSkill.upsert({
    where: { employeeId_skillId: { employeeId: body.employeeId, skillId: skill.id } },
    update: { level, note: body.note?.slice(0, 300) ?? null },
    create: {
      employeeId: body.employeeId, skillId: skill.id, level,
      note: typeof body.note === 'string' ? body.note.slice(0, 300) : null,
    },
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const row = await prisma.employeeSkill.findUnique({
    where: { id }, select: { employeeId: true },
  })
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!(await mayRecordFor(payload, row.employeeId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.employeeSkill.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

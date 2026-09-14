/**
 * Job profiles — the skills each role asks for.
 *
 *   GET                                  every role with its profile (HR and executives)
 *   POST   { roleTitle, skillName, level } add or change one requirement (HR)
 *   DELETE ?id=                          remove one requirement (HR)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveTalentAccess, seesEveryone, canManageTalentSetup, cleanText } from '@/lib/talent'
import { roleProfiles } from '@/lib/queries/role-profiles'

export async function GET(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!seesEveryone(access)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const profiles = [...(await roleProfiles()).values()].sort((a, b) => a.title.localeCompare(b.title))
  return NextResponse.json({ profiles })
}

export async function POST(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManageTalentSetup(access)) {
    return NextResponse.json({ error: 'Only HR can edit job profiles.' }, { status: 403 })
  }
  const body = (await request.json().catch(() => ({}))) as { roleTitle?: string; skillName?: string; level?: number }
  const roleTitle = cleanText(body.roleTitle, 120)
  const name = cleanText(body.skillName, 80)
  if (!roleTitle || !name) return NextResponse.json({ error: 'Pick a role and name the skill.' }, { status: 400 })
  const level = typeof body.level === 'number' && [1, 2, 3, 4].includes(body.level) ? body.level : 3

  const existing = await prisma.skill.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } }, select: { id: true },
  })
  const skill = existing ?? await prisma.skill.create({ data: { name }, select: { id: true } })

  // One spelling per role: reuse the title already on file if it differs only in case.
  const sameRole = await prisma.roleSkill.findFirst({
    where: { roleTitle: { equals: roleTitle, mode: 'insensitive' } }, select: { roleTitle: true },
  })
  const title = sameRole?.roleTitle ?? roleTitle

  await prisma.roleSkill.upsert({
    where: { roleTitle_skillId: { roleTitle: title, skillId: skill.id } },
    update: { level },
    create: { roleTitle: title, skillId: skill.id, level },
  })
  return NextResponse.json({ ok: true }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManageTalentSetup(access)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const row = await prisma.roleSkill.findUnique({ where: { id }, select: { id: true } })
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.roleSkill.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

/**
 * Succession plans.
 *
 *   GET   every plan with its incumbent and candidates (HR and executives)
 *   POST  { roleTitle, incumbentId?, critical?, note? } — HR only
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  resolveTalentAccess, canSeeSuccession, canManageSuccession, cleanText,
} from '@/lib/talent'

export async function GET(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canSeeSuccession(access)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const plans = await prisma.successionPlan.findMany({
    orderBy: [{ critical: 'desc' }, { roleTitle: 'asc' }],
    select: {
      id: true, roleTitle: true, critical: true, note: true,
      incumbent: { select: { id: true, fullName: true, designation: true } },
      candidates: {
        select: {
          id: true, readiness: true, note: true,
          employee: { select: { id: true, fullName: true, designation: true } },
        },
      },
    },
  })
  return NextResponse.json({ plans })
}

export async function POST(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManageSuccession(access)) {
    return NextResponse.json({ error: 'Only HR can create succession plans.' }, { status: 403 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    roleTitle?: string; incumbentId?: string; critical?: boolean; note?: string
  }
  const roleTitle = cleanText(body.roleTitle, 120)
  if (!roleTitle) return NextResponse.json({ error: 'Name the role.' }, { status: 400 })

  let incumbentId: string | null = null
  if (typeof body.incumbentId === 'string' && body.incumbentId) {
    const e = await prisma.employee.findUnique({ where: { id: body.incumbentId }, select: { id: true, status: true } })
    if (!e || e.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'The incumbent must be an active employee.' }, { status: 400 })
    }
    incumbentId = e.id
  }

  const plan = await prisma.successionPlan.create({
    data: {
      roleTitle,
      incumbentId,
      critical: body.critical !== false,
      note: cleanText(body.note, 1000),
      createdById: access.userId,
    },
    select: { id: true },
  })
  return NextResponse.json({ plan }, { status: 201 })
}

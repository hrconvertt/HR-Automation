/**
 * GET /api/audit — the audit log, read back.
 *
 * HR and executives only: this is every salary edit and every attendance
 * correction in one place, which is exactly the thing that should not be
 * browsable by the people it is about.
 */
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

const PAGE_SIZE = 50

export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const role = payload.role === 'HR_ADMIN' ? (cookieStore.get('hr_preview_role')?.value ?? payload.role) : payload.role
  if (role !== 'HR_ADMIN' && role !== 'EXECUTIVE') {
    return NextResponse.json({ error: 'You do not have access to the audit trail.' }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const entity = sp.get('entity') ?? ''
  const action = sp.get('action') ?? ''
  const q = (sp.get('q') ?? '').trim()
  const since = sp.get('since') ?? ''
  const page = Math.max(1, Number(sp.get('page') ?? 1) || 1)

  const where: Prisma.AuditLogWhereInput = {}
  if (entity) where.entity = entity
  if (action) where.action = action
  if (since) {
    const days = Number(since)
    if (Number.isFinite(days) && days > 0) {
      where.createdAt = { gte: new Date(Date.now() - days * 86_400_000) }
    }
  }
  if (q) {
    where.employee = {
      OR: [
        { fullName: { contains: q, mode: 'insensitive' } },
        { employeeCode: { contains: q, mode: 'insensitive' } },
      ],
    }
  }

  const [total, rows, byEntity, byAction] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, action: true, entity: true, entityId: true, createdAt: true,
        oldValue: true, newValue: true, ipAddress: true, userId: true,
        employee: { select: { id: true, fullName: true, employeeCode: true } },
      },
    }),
    // Facets ignore the entity filter so the chips keep showing what else exists.
    prisma.auditLog.groupBy({ by: ['entity'], _count: { _all: true }, orderBy: { _count: { entity: 'desc' } } }),
    prisma.auditLog.groupBy({ by: ['action'], _count: { _all: true } }),
  ])

  // AuditLog stores a userId with no relation, so the actors come separately.
  const userIds = [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))]
  const users = userIds.length
    ? await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, employee: { select: { fullName: true } } },
    })
    : []
  const actorById = new Map(users.map((u) => [u.id, { name: u.employee?.fullName ?? u.email, email: u.email }]))

  return NextResponse.json({
    rows: rows.map((r) => ({
      id: r.id, action: r.action, entity: r.entity, entityId: r.entityId,
      createdAt: r.createdAt.toISOString(),
      oldValue: r.oldValue, newValue: r.newValue, ipAddress: r.ipAddress,
      actor: r.userId ? actorById.get(r.userId) ?? null : null,
      subject: r.employee,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    facets: {
      entity: byEntity.map((e) => ({ value: e.entity, count: e._count._all })),
      action: byAction.map((a) => ({ value: a.action, count: a._count._all })),
    },
  })
}

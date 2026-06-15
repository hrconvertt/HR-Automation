/**
 * GET  /api/positions       - list positions (with employee counts, departments)
 * POST /api/positions       - create a new position (HR only)
 *
 * Position ladder is HR-managed. Read access for any authenticated user
 * (employees pick a position on their profile edit dialog).
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { isValidPositionLevel } from '@/lib/position-levels'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const departmentId = searchParams.get('departmentId')
  const includeInactive = searchParams.get('includeInactive') === '1'

  const positions = await prisma.position.findMany({
    where: {
      ...(departmentId ? { departmentId } : {}),
      ...(includeInactive ? {} : { active: true }),
    },
    include: {
      department: { select: { id: true, name: true, code: true } },
      _count: { select: { employees: true } },
    },
    orderBy: [{ departmentId: 'asc' }, { title: 'asc' }],
  })

  return NextResponse.json({
    positions: positions.map((p) => ({
      id: p.id,
      title: p.title,
      level: p.level,
      description: p.description,
      active: p.active,
      department: p.department,
      employeeCount: p._count.employees,
    })),
  })
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true },
  })
  if (!me || me.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'HR only' }, { status: 403 })
  }

  const body = await request.json()
  const title = String(body.title ?? '').trim()
  const level = String(body.level ?? '').trim()
  const departmentId = body.departmentId ? String(body.departmentId) : null
  const description = body.description ? String(body.description).trim() : null

  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  if (!isValidPositionLevel(level)) {
    return NextResponse.json({ error: 'Invalid level' }, { status: 400 })
  }

  // Prevent duplicate (title, dept)
  const existing = await prisma.position.findFirst({
    where: { title, departmentId },
  })
  if (existing) {
    return NextResponse.json({ error: 'Position with that title already exists in this department' }, { status: 409 })
  }

  const position = await prisma.position.create({
    data: { title, level, departmentId, description },
  })
  return NextResponse.json({ position })
}

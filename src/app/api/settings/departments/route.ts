import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

async function gateHR(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return { error: 'Unauthorized', status: 401 as const }
  const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { role: true } })
  if (!user || user.role !== 'HR_ADMIN') return { error: 'Forbidden', status: 403 as const }
  // Block writes when HR is previewing as another role (read-only preview).
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return { error: 'Switch back to HR view to manage departments', status: 403 as const }
  }
  return { ok: true as const }
}

/**
 * GET — list all departments with member counts, gender breakdown, lead.
 *      Used by the Org Chart "Department Breakdown" panel. Open to any
 *      authenticated user (read-only directory data).
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const departments = await prisma.department.findMany({
    orderBy: { name: 'asc' },
    include: {
      head: { select: { id: true, fullName: true, designation: true, photoUrl: true } },
      employees: {
        where: { status: 'ACTIVE' },
        select: { id: true, fullName: true, designation: true, gender: true, photoUrl: true },
        orderBy: { fullName: 'asc' },
      },
    },
  })

  const rows = departments.map((d) => {
    let male = 0, female = 0, other = 0
    for (const e of d.employees) {
      const g = (e.gender ?? '').toLowerCase()
      if (g.startsWith('m')) male++
      else if (g.startsWith('f')) female++
      else if (g) other++
    }
    // Implicit lead fallback: not the head field — but in UI we want a "designated
    // lead". If headEmployeeId is null, the breakdown reports no lead set.
    return {
      id: d.id,
      code: d.code,
      name: d.name,
      headEmployeeId: d.headEmployeeId,
      head: d.head,
      memberCount: d.employees.length,
      gender: { male, female, other },
      members: d.employees,
    }
  })

  return NextResponse.json({ departments: rows })
}

/**
 * POST — create a new department. HR_ADMIN only.
 */
export async function POST(request: NextRequest) {
  const gate = await gateHR(request)
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const body = await request.json().catch(() => ({}))
  const name = String(body.name ?? '').trim()
  const code = String(body.code ?? '').trim().toUpperCase()
  const headEmployeeId = body.headEmployeeId ? String(body.headEmployeeId) : null

  if (!name || !code) {
    return NextResponse.json({ error: 'name and code are required' }, { status: 400 })
  }
  const existing = await prisma.department.findUnique({ where: { code } })
  if (existing) return NextResponse.json({ error: 'A department with this code already exists' }, { status: 409 })

  const dept = await prisma.department.create({
    data: { name, code, headEmployeeId },
  })
  return NextResponse.json({ department: dept }, { status: 201 })
}

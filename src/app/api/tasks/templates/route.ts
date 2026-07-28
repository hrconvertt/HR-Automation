import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

async function getRole() {
  const c = await cookies()
  const tok = c.get('hr_token')?.value
  const payload = await verifyToken(tok)
  if (!payload) return null
  const me = await prisma.user.findUnique({ where: { id: payload.userId }, select: { role: true } })
  if (!me) return null
  const previewRole = c.get('hr_preview_role')?.value
  const effectiveRole = previewRole && me.role === 'HR_ADMIN' ? previewRole : me.role
  return { role: effectiveRole, preview: !!previewRole }
}

export async function GET() {
  const templates = await prisma.taskTemplate.findMany({
    where: { isActive: true },
    include: { department: { select: { name: true } } },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json({ templates })
}

export async function POST(request: NextRequest) {
  const ctx = await getRole()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'HR_ADMIN') return NextResponse.json({ error: 'HR only' }, { status: 403 })
  if (ctx.preview) return NextResponse.json({ error: 'Preview mode cannot create' }, { status: 403 })

  const body = await request.json()
  const name = String(body.name || '').trim()
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })
  const expectedHours = Number(body.expectedHours)
  if (!Number.isFinite(expectedHours) || expectedHours <= 0) {
    return NextResponse.json({ error: 'Expected hours must be > 0' }, { status: 400 })
  }
  const created = await prisma.taskTemplate.create({
    data: {
      name,
      description: body.description ? String(body.description).slice(0, 2000) : null,
      expectedHours,
      complexity: String(body.complexity || 'MEDIUM'),
      departmentId: body.departmentId ? String(body.departmentId) : null,
    },
  })
  return NextResponse.json({ template: created }, { status: 201 })
}

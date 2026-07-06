/**
 * GET /api/assets/list â†’ { assets, assignments }
 *
 * HR_ADMIN sees everything. Managers see their team's assignments only.
 * Employees see their own. Salary-confidentiality doesn't apply here
 * (asset cost is not salary), but cost is still HR-only on the client.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, employee: { select: { id: true } } },
  })
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const previewRole = me.role === 'HR_ADMIN' ? request.cookies.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? me.role
  const meId = me.employee?.id ?? null

  let assetWhere: object = {}
  let assignWhere: object = { returnedDate: null }
  if (effectiveRole === 'MANAGER' && meId) {
    assetWhere = { id: '__none__' }   // managers don't browse inventory
    assignWhere = { returnedDate: null, employee: { reportingManagerId: meId } }
  } else if (effectiveRole === 'EMPLOYEE') {
    assetWhere = { id: '__none__' }
    assignWhere = meId ? { returnedDate: null, employeeId: meId } : { id: '__none__' }
  } else if (effectiveRole === 'EXECUTIVE') {
    // Executives see assignments at a high level â€” no inventory CRUD.
    assetWhere = {}
  }

  const [assets, assignments] = await Promise.all([
    prisma.asset.findMany({ where: assetWhere, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.assetAssignment.findMany({
      where: assignWhere,
      orderBy: { assignedDate: 'desc' },
      include: {
        asset: true,
        employee: { select: { fullName: true, employeeCode: true } },
      },
    }),
  ])

  return NextResponse.json({ assets, assignments })
}

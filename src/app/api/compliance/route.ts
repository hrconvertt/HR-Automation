import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'

/**
 * GET /api/compliance
 *
 *   Statutory reports (EOBI / FBR / PSEB / Social Security).
 *   HR_ADMIN and EXECUTIVE only â€” these touch tax + statutory filings.
 *   Managers and Employees do not see this data.
 *
 *   HR previewing as another role inherits that role's scope, so
 *   previewing-as-Employee correctly blocks access.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true },
  })
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const previewRole = me.role === 'HR_ADMIN'
    ? request.cookies.get('hr_preview_role')?.value
    : undefined
  const effectiveRole = previewRole ?? me.role

  if (!['HR_ADMIN', 'EXECUTIVE'].includes(effectiveRole)) {
    return NextResponse.json({ error: 'HR or CEO only' }, { status: 403 })
  }

  const reports = await prisma.complianceReport.findMany({
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    take: 50,
  })
  return NextResponse.json({ reports })
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view to perform this action' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { type, month, year } = body

    const validTypes = ['EOBI', 'FBR_WITHHOLDING', 'PSEB', 'SOCIAL_SECURITY']
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: 'Invalid report type' }, { status: 400 })
    }

    const report = await prisma.complianceReport.upsert({
      where: { type_month_year: { type, month, year } },
      update: { status: 'GENERATED', generatedById: payload.employeeId ?? null },
      create: {
        type,
        month,
        year,
        status: 'GENERATED',
        generatedById: payload.employeeId ?? null,
      },
    })

    return NextResponse.json({ report }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/compliance]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

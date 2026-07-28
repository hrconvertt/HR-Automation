/**
 * GET /api/attendance/grid?month=YYYY-MM&department=<dept>&search=<query>&summary=1
 *
 * Returns a Workday-style attendance grid mirroring the source xlsx:
 *   - One row per employee (filtered by role + dept + search)
 *   - One cell per day of the requested month
 *   - Status values: P / WFH / L / H / A / WE  (present / wfh / leave / half / absent / weekend)
 *
 * When summary=1, returns per-month totals across the Nov-2025 → Jun-2026 range
 * (Convertt's reporting window) instead of a per-day grid — used by Summary View.
 *
 * Role gating (enforced server-side, NOT trusted from query):
 *   HR_ADMIN  — all employees
 *   EXECUTIVE — all employees, no export
 *   MANAGER   — self + direct reports
 *   EMPLOYEE  — self only
 *
 * Query + shaping logic lives in src/lib/queries/attendance-grid.ts so the
 * /dashboard/attendance server component can render the initial grid without
 * a client fetch waterfall.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { buildAttendanceGrid, buildAttendanceMonthCsv } from '@/lib/queries/attendance-grid'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const previewRole = user.role === 'HR_ADMIN' ? request.cookies.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user.role
  const myEmpId = user.employee?.id ?? null

  const { searchParams } = new URL(request.url)

  // ── Month export (?format=csv) — server-generated, HR-only ────────────────
  if (searchParams.get('format') === 'csv') {
    if (effectiveRole !== 'HR_ADMIN') {
      return NextResponse.json({ error: 'Only HR can export attendance' }, { status: 403 })
    }
    const { csv, monthKey } = await buildAttendanceMonthCsv({
      month: searchParams.get('month'),
      department: searchParams.get('department') ?? '',
      search: searchParams.get('search') ?? '',
    })
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="attendance-${monthKey}.csv"`,
      },
    })
  }

  const data = await buildAttendanceGrid({
    effectiveRole,
    myEmpId,
    summary: searchParams.get('summary') === '1',
    department: searchParams.get('department') ?? '',
    search: searchParams.get('search') ?? '',
    month: searchParams.get('month'),
  })

  return NextResponse.json(data)
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveJobChangeAccess } from '@/lib/job-changes'

// GET /api/job-changes/options
// Picker data for the "New Job Change" dialog:
//   - employees: who the requester may file a job change FOR
//       HR_ADMIN → all active employees; MANAGER → their direct reports only
//   - departments: all (names only)
//   - managers: all active employees (id + name + designation only — same
//     visibility as the org chart; no salary/contact data)
export async function GET(request: NextRequest) {
  const access = await resolveJobChangeAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isHR = access.effectiveRole === 'HR_ADMIN'
  const isManager = access.effectiveRole === 'MANAGER'
  if (!isHR && !isManager) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const employeeWhere = isHR
    ? { status: 'ACTIVE' }
    : { status: 'ACTIVE', reportingManagerId: access.employeeId ?? '__none__' }

  const [employees, departments, managers] = await Promise.all([
    prisma.employee.findMany({
      where: employeeWhere,
      select: { id: true, fullName: true, employeeCode: true, designation: true, departmentId: true, reportingManagerId: true },
      orderBy: { fullName: 'asc' },
    }),
    prisma.department.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.employee.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, fullName: true, designation: true },
      orderBy: { fullName: 'asc' },
    }),
  ])

  return NextResponse.json({ employees, departments, managers })
}

/**
 * POST /api/payroll/[id]/generate-payslip-docs
 *
 * HR-only. For every payslip in the given PayrollRun, create an
 * EmployeeDocument of type='SALARY_SLIP' pointing at the lazy-rendered
 * /payslip/[id]/print route — no puppeteer needed because the print URL
 * is the canonical artifact.
 *
 * Idempotent — skips when a SALARY_SLIP doc with the same name already
 * exists for that employee.
 *
 * Body params:
 *   visibleToEmployee?: boolean  // default true
 *   notify?:            boolean  // default true (only when visible=true)
 *
 * Returns: { created: number, notified: number, skipped: number }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true },
  })
  if (!me || me.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Forbidden — HR only' }, { status: 403 })
  }

  let body: { visibleToEmployee?: boolean; notify?: boolean } = {}
  try { body = await request.json() } catch { /* allow empty body */ }
  const visibleToEmployee = body.visibleToEmployee !== false
  const notify = visibleToEmployee && body.notify !== false

  const run = await prisma.payrollRun.findUnique({
    where: { id },
    select: {
      id: true, month: true, year: true,
      payslips: {
        select: { id: true, employeeId: true },
      },
    },
  })
  if (!run) return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 })

  const monthName = MONTHS[run.month - 1] ?? `Month ${run.month}`
  const docName = `Salary Slip — ${monthName} ${run.year}`

  let created = 0
  let skipped = 0
  let notified = 0

  for (const p of run.payslips) {
    // Idempotency check
    const existing = await prisma.employeeDocument.findFirst({
      where: {
        employeeId: p.employeeId,
        type: 'SALARY_SLIP',
        name: docName,
      },
      select: { id: true },
    })
    if (existing) { skipped++; continue }

    await prisma.employeeDocument.create({
      data: {
        employeeId: p.employeeId,
        type: 'SALARY_SLIP',
        name: docName,
        url: `/payslip/${p.id}/print`,
        visibleToEmployee,
        uploadedById: payload.userId,
      },
    })
    created++

    if (notify) {
      await prisma.notification.create({
        data: {
          employeeId: p.employeeId,
          type: 'PAYSLIP_READY',
          title: `Your ${monthName} payslip is ready`,
          message: `Your salary slip for ${monthName} ${run.year} is now available in your Documents.`,
          link: `/payslip/${p.id}/print`,
        },
      }).catch(() => { /* notification failures shouldn't roll back the doc */ })
      notified++
    }
  }

  return NextResponse.json({ created, skipped, notified })
}

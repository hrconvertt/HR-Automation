/**
 * /dashboard/payroll/slips — issue salary slips.
 *
 * Every employee on the run in one list: preview the slip, send it to their
 * inbox in the app, email it, or send the lot. Generating the PDFs and issuing
 * them are separate acts — a slip can be regenerated any number of times, but
 * sending it is the moment it leaves the building.
 *
 * Defaults to the most recent run; ?runId= or ?month=&year= picks another.
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { SlipIssueBoard, type SlipRow } from './_components/slip-issue-board'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

interface Props {
  searchParams: Promise<{ runId?: string; month?: string; year?: string }>
}

export default async function SalarySlipsPage({ searchParams }: Props) {
  const sp = await searchParams
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: payload.userId }, select: { role: true },
  })
  const previewRole =
    user?.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const role = previewRole ?? user?.role

  // Issuing slips is HR's job — everyone else reads their own at /dashboard/payroll.
  if (role !== 'HR_ADMIN') redirect('/dashboard/payroll')

  const run = sp.runId
    ? await prisma.payrollRun.findUnique({ where: { id: sp.runId } })
    : sp.month && sp.year
      ? await prisma.payrollRun.findFirst({
          where: { month: Number(sp.month), year: Number(sp.year), runType: 'REGULAR' },
        })
      : await prisma.payrollRun.findFirst({
          where: { runType: 'REGULAR' },
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
        })

  if (!run) {
    return (
      <div className="space-y-4">
        <Back />
        <p className="text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg py-10 text-center">
          No payroll run to issue slips for yet.
        </p>
      </div>
    )
  }

  const payslips = await prisma.payslip.findMany({
    where: { payrollRunId: run.id },
    select: {
      id: true, netSalary: true, sentAt: true,
      employee: {
        select: { fullName: true, employeeCode: true, designation: true, email: true },
      },
    },
    orderBy: { employee: { fullName: 'asc' } },
  })

  const rows: SlipRow[] = payslips.map((p) => ({
    id: p.id,
    netSalary: p.netSalary,
    sentAt: p.sentAt?.toISOString() ?? null,
    employee: p.employee,
  }))

  return (
    <div className="space-y-4">
      <Back />
      <SlipIssueBoard
        runId={run.id}
        period={`${MONTHS[run.month - 1]} ${run.year}`}
        rows={rows}
      />
    </div>
  )
}

function Back() {
  return (
    <Link
      href="/dashboard/payroll"
      className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
    >
      <ArrowLeft className="w-3.5 h-3.5" /> Back to Payroll
    </Link>
  )
}

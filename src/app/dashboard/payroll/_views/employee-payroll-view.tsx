import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { Download, Wallet, Banknote, Landmark, ShieldCheck, FileText } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

const monthName = (m: number) =>
  new Date(2000, m - 1, 1).toLocaleDateString('en-GB', { month: 'long' })

async function getEmployeePayrollData(employeeId: string) {
  const currentYear = new Date().getFullYear()

  const [latest, history, ytd] = await Promise.all([
    prisma.payslip.findFirst({
      where: { employeeId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    }),
    prisma.payslip.findMany({
      where: { employeeId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    }),
    prisma.payslip.findMany({
      where: { employeeId, year: currentYear },
      select: {
        grossSalary: true,
        netSalary: true,
        incomeTax: true,
        eobi: true,
      },
    }),
  ])

  const ytdGross = ytd.reduce((s, p) => s + p.grossSalary, 0)
  const ytdNet = ytd.reduce((s, p) => s + p.netSalary, 0)
  const ytdTax = ytd.reduce((s, p) => s + p.incomeTax, 0)
  const ytdEobi = ytd.reduce((s, p) => s + p.eobi, 0)

  return { latest, history, ytdGross, ytdNet, ytdTax, ytdEobi, currentYear }
}

export async function EmployeePayrollView({ employeeId }: { employeeId: string }) {
  const { latest, history, ytdGross, ytdNet, ytdTax, ytdEobi, currentYear } =
    await getEmployeePayrollData(employeeId)

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 to-teal-50 p-6">
        <h2 className="text-xl font-bold text-slate-900">My Pay</h2>
        <p className="text-sm text-slate-600 mt-1">
          View your payslips, earnings, and tax info.
        </p>
      </div>

      {/* Latest Payslip */}
      <Card className="rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white">
          <div className="flex items-end justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-300">Latest Payslip</p>
              {latest ? (
                <>
                  <p className="text-sm text-slate-300 mt-1">
                    {monthName(latest.month)} {latest.year}
                  </p>
                  <p className="text-4xl font-bold mt-2">{formatCurrency(latest.netSalary)}</p>
                  <p className="text-xs text-slate-300 mt-1">
                    Gross: {formatCurrency(latest.grossSalary)}
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-300 mt-2">No payslip available yet.</p>
              )}
            </div>
            {latest && (() => {
              // Employee-friendly view of payroll status:
              //   PAID / SENT      → "Paid" badge + PDF available
              //   DRAFT / anything → "Releasing soon" badge, PDF hidden
              // Reason: "Draft" is HR's internal workflow label and worries
              // the employee. They also shouldn't print a not-yet-final
              // payslip and submit it to a bank.
              const isReleased = latest.status === 'PAID' || latest.status === 'SENT'
              return (
                <div className="flex items-center gap-3">
                  {isReleased ? (
                    <>
                      <Badge variant="success">Paid</Badge>
                      <Link
                        href={`/dashboard/payroll/payslip/${latest.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-sm font-medium text-slate-900"
                      >
                        <Download className="w-3.5 h-3.5" />
                        View / Print PDF
                      </Link>
                    </>
                  ) : (
                    <div className="flex flex-col items-end gap-1">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        Releasing soon
                      </span>
                      <span className="text-[11px] text-slate-300">PDF available once finalized</span>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </div>

        {latest && (
          <CardContent className="p-6 pt-6 space-y-5">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase mb-3">Earnings</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                <BreakdownRow label="Basic" value={latest.basic} />
                <BreakdownRow label="House Rent" value={latest.houseRent} />
                <BreakdownRow label="Utilities" value={latest.utilities} />
                <BreakdownRow label="Food" value={latest.food} />
                <BreakdownRow label="Fuel" value={latest.fuel} />
                <BreakdownRow label="Medical" value={latest.medicalAllowance} />
                <BreakdownRow label="Other Allowances" value={latest.otherAllowance} />
                <BreakdownRow label="Overtime Pay" value={latest.overtimePay} />
                <BreakdownRow label="Bonus" value={latest.bonus} />
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase mb-3">Deductions</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <BreakdownRow label="EOBI" value={latest.eobi} negative />
                <BreakdownRow label="Income Tax" value={latest.incomeTax} negative />
                <BreakdownRow
                  label="Other Deductions"
                  value={latest.otherDeductions}
                  negative
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <div className="text-xs text-slate-500">
                Working Days: {latest.workingDays} · Present: {latest.presentDays} · Leave:{' '}
                {latest.leaveDays} · Absent: {latest.absentDays}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* YTD Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label={`${currentYear} Gross (YTD)`}
          value={formatCurrency(ytdGross)}
          Icon={Wallet}
          color="bg-blue-50 text-blue-600"
        />
        <KpiCard
          label={`${currentYear} Net (YTD)`}
          value={formatCurrency(ytdNet)}
          Icon={Banknote}
          color="bg-emerald-50 text-emerald-600"
        />
        <KpiCard
          label={`${currentYear} Tax Paid`}
          value={formatCurrency(ytdTax)}
          Icon={Landmark}
          color="bg-amber-50 text-amber-600"
        />
        <KpiCard
          label={`${currentYear} EOBI Paid`}
          value={formatCurrency(ytdEobi)}
          Icon={ShieldCheck}
          color="bg-purple-50 text-purple-600"
        />
      </div>

      {/* History */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>My Payslip History</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead>Working Days</TableHead>
              <TableHead>Gross</TableHead>
              <TableHead>Deductions</TableHead>
              <TableHead>Net</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-slate-400">
                  <FileText className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                  No payslips yet.
                </TableCell>
              </TableRow>
            ) : (
              history.map((p) => {
                const deductions = p.eobi + p.incomeTax + p.otherDeductions
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium text-slate-900">
                      {monthName(p.month)} {p.year}
                    </TableCell>
                    <TableCell>
                      {p.presentDays}/{p.workingDays}
                    </TableCell>
                    <TableCell>{formatCurrency(p.grossSalary)}</TableCell>
                    <TableCell className="text-red-600">−{formatCurrency(deductions)}</TableCell>
                    <TableCell className="font-semibold">
                      {formatCurrency(p.netSalary)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          p.status === 'PAID' || p.status === 'SENT' ? 'success' : 'warning'
                        }
                      >
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/dashboard/payroll/payslip/${p.id}`}
                        className="inline-flex items-center justify-center rounded-md p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                        title="View / print payslip"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </Link>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

function KpiCard({
  label,
  value,
  Icon,
  color,
}: {
  label: string
  value: string
  Icon: React.ComponentType<{ className?: string }>
  color: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="text-xl font-bold text-slate-900 mt-2">{value}</p>
        </div>
        <div className={`p-2.5 rounded-lg ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  )
}

function BreakdownRow({
  label,
  value,
  negative,
}: {
  label: string
  value: number
  negative?: boolean
}) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={`text-sm font-semibold mt-0.5 ${
          negative ? 'text-red-600' : 'text-slate-900'
        }`}
      >
        {negative ? '−' : ''}
        {formatCurrency(value)}
      </p>
    </div>
  )
}

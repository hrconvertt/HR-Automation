/**
 * Manager Payroll view.
 *
 * Manager sees:
 *   - Their OWN payslip in full (it's their pay)
 *   - Their TEAM's attendance summary for the month (present days, OT hours)
 *     — NO salary, gross, net amounts. Compensation is HR-only.
 */

import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { Users, Clock, Calendar } from 'lucide-react'
import { formatCurrency, getInitials } from '@/lib/utils'
import { formatDays } from '@/lib/leave-types'

const monthName = (m: number) =>
  new Date(2000, m - 1, 1).toLocaleDateString('en-GB', { month: 'long' })

async function getManagerPayrollData(managerEmployeeId: string) {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const [teamPayslips, myPayslip] = await Promise.all([
    prisma.payslip.findMany({
      where: {
        month,
        year,
        employee: { reportingManagerId: managerEmployeeId },
      },
      // Manager-visible fields only — no salary, gross, net, eobi, tax, etc.
      select: {
        id: true,
        presentDays: true,
        workingDays: true,
        leaveDays: true,
        absentDays: true,
        status: true,
        employee: {
          select: { id: true, fullName: true, employeeCode: true, designation: true },
        },
      },
      orderBy: { employee: { fullName: 'asc' } },
    }),
    prisma.payslip.findFirst({
      where: { employeeId: managerEmployeeId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    }),
  ])

  return { teamPayslips, myPayslip, month, year }
}

export async function ManagerPayrollView({
  managerEmployeeId,
}: {
  managerEmployeeId: string
}) {
  const { teamPayslips, myPayslip, month, year } = await getManagerPayrollData(managerEmployeeId)

  const teamSize = teamPayslips.length
  const totalPresent = teamPayslips.reduce((s, p) => s + p.presentDays, 0)
  const totalLeave = teamPayslips.reduce((s, p) => s + p.leaveDays, 0)
  const totalAbsent = teamPayslips.reduce((s, p) => s + p.absentDays, 0)

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-6 text-white shadow-md">
        <h2 className="text-xl font-bold">My Payroll</h2>
        <p className="text-sm text-white/85 mt-1">
          Your payslip below, plus your team&apos;s attendance summary for {monthName(month)} {year}.
          Compensation amounts are managed by HR.
        </p>
      </div>

      {/* My Own Payslip — at the top because it's the manager's primary need */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>My Payslip</CardTitle>
        </CardHeader>
        <CardContent>
          {!myPayslip ? (
            <p className="text-sm text-slate-400">No payslip available yet.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-end justify-between flex-wrap gap-3">
                <div>
                  <p className="text-xs text-slate-500">{monthName(myPayslip.month)} {myPayslip.year}</p>
                  <p className="text-3xl font-bold text-slate-900 mt-1">{formatCurrency(myPayslip.netSalary)}</p>
                  <p className="text-xs text-slate-500 mt-1">Gross: {formatCurrency(myPayslip.grossSalary)}</p>
                </div>
                {/* Manager sees their own payslip with the same employee-friendly
                    status copy — "Draft" is HR's internal label, hide it. */}
                {(() => {
                  const isReleased = myPayslip.status === 'PAID' || myPayslip.status === 'SENT'
                  return (
                    <div className="flex items-center gap-2">
                      {isReleased ? (
                        <>
                          <Badge variant="success">Paid</Badge>
                          <Link
                            href={`/dashboard/payroll/payslip/${myPayslip.id}`}
                            className="text-xs px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                          >
                            View / Print PDF
                          </Link>
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                          Releasing soon
                        </span>
                      )}
                    </div>
                  )
                })()}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <BreakdownRow label="Basic" value={myPayslip.basic} />
                <BreakdownRow label="House Rent" value={myPayslip.houseRent} />
                <BreakdownRow label="Utilities" value={myPayslip.utilities} />
                <BreakdownRow label="Medical" value={myPayslip.medicalAllowance} />
                <BreakdownRow label="Fuel" value={myPayslip.fuel} />
                <BreakdownRow label="Food" value={myPayslip.food} />
                <BreakdownRow label="Bonus" value={myPayslip.bonus} />
                <BreakdownRow label="Overtime" value={myPayslip.overtimePay} />
              </div>

              <div className="border-t border-slate-100 pt-3 grid grid-cols-2 md:grid-cols-3 gap-3">
                <BreakdownRow label="EOBI" value={myPayslip.eobi} negative />
                <BreakdownRow label="Income Tax" value={myPayslip.incomeTax} negative />
                <BreakdownRow label="Other Deductions" value={myPayslip.otherDeductions} negative />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Team Attendance Summary — NO salary numbers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Team Size" value={String(teamSize)} Icon={Users} color="bg-purple-50 text-purple-600" />
        <KpiCard label="Total Days Present" value={String(totalPresent)} Icon={Calendar} color="bg-emerald-50 text-emerald-600" />
        <KpiCard label="Total Leave Days" value={String(totalLeave)} Icon={Clock} color="bg-blue-50 text-blue-600" />
        <KpiCard label="Total Absences" value={String(totalAbsent)} Icon={Calendar} color="bg-rose-50 text-rose-600" />
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Team Attendance — {monthName(month)} {year}</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Designation</TableHead>
              <TableHead>Present</TableHead>
              <TableHead>Leave</TableHead>
              <TableHead>Absent</TableHead>
              <TableHead>Payroll Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teamPayslips.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-slate-400">
                  No team payslips for this month yet.
                </TableCell>
              </TableRow>
            ) : (
              teamPayslips.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">
                        {getInitials(p.employee.fullName)}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{p.employee.fullName}</p>
                        <p className="text-xs text-slate-400">{p.employee.employeeCode}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">{p.employee.designation}</TableCell>
                  <TableCell className="font-medium">{p.presentDays}/{p.workingDays}</TableCell>
                  <TableCell>{formatDays(p.leaveDays)}</TableCell>
                  <TableCell>{p.absentDays}</TableCell>
                  <TableCell>
                    <Badge variant={p.status === 'PAID' ? 'success' : 'warning'}>{p.status}</Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

function KpiCard({ label, value, Icon, color }: {
  label: string; value: string; Icon: React.ComponentType<{ className?: string }>; color: string;
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

function BreakdownRow({ label, value, negative }: { label: string; value: number; negative?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-sm font-semibold mt-0.5 ${negative ? 'text-red-600' : 'text-slate-900'}`}>
        {negative ? '−' : ''}{formatCurrency(value)}
      </p>
    </div>
  )
}

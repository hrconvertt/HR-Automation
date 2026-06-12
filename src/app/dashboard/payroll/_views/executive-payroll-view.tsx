import { prisma } from '@/lib/prisma'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, Wallet, Banknote, TrendingUp, Landmark, ShieldCheck } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { CeoReviewPanel } from './ceo-review-panel'

const monthName = (m: number) =>
  new Date(2000, m - 1, 1).toLocaleDateString('en-GB', { month: 'short' })

async function getExecutivePayrollData() {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const currentYear = year

  // Find a payroll run currently awaiting CEO review (any month).
  const pendingCeoRun = await prisma.payrollRun.findFirst({
    where: { status: 'PENDING_CEO' },
    select: { id: true, month: true, year: true, totalNet: true, totalGross: true },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  })

  const [currentRun, last12Runs, ytdRuns, headcount, deptPayslips] = await Promise.all([
    prisma.payrollRun.findFirst({
      where: { month, year },
      select: { totalGross: true, totalNet: true, totalEOBI: true, totalTax: true },
    }),
    prisma.payrollRun.findMany({
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: 12,
      select: {
        id: true,
        month: true,
        year: true,
        totalNet: true,
        totalGross: true,
        status: true,
      },
    }),
    prisma.payrollRun.findMany({
      where: { year: currentYear },
      select: {
        totalNet: true,
        totalGross: true,
        totalEOBI: true,
        totalTax: true,
      },
    }),
    prisma.employee.count({
      where: { status: 'ACTIVE', salary: { isNot: null } },
    }),
    prisma.payslip.findMany({
      where: { month, year },
      select: {
        netSalary: true,
        employee: {
          select: {
            department: { select: { name: true } },
          },
        },
      },
    }),
  ])

  const ytdNet = ytdRuns.reduce((s, r) => s + r.totalNet, 0)
  const ytdGross = ytdRuns.reduce((s, r) => s + r.totalGross, 0)
  const ytdEobi = ytdRuns.reduce((s, r) => s + r.totalEOBI, 0)
  const ytdTax = ytdRuns.reduce((s, r) => s + r.totalTax, 0)

  const currentMonthCost = currentRun?.totalNet ?? 0
  const avgPerEmployee = headcount > 0 ? currentMonthCost / headcount : 0

  // Group by department
  const deptMap = new Map<string, number>()
  for (const p of deptPayslips) {
    const name = p.employee.department?.name ?? 'Unassigned'
    deptMap.set(name, (deptMap.get(name) ?? 0) + p.netSalary)
  }
  const deptCosts = Array.from(deptMap.entries())
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
  const maxDept = deptCosts.length > 0 ? deptCosts[0].total : 1

  return {
    month,
    year,
    currentMonthCost,
    ytdNet,
    ytdGross,
    ytdEobi,
    ytdTax,
    avgPerEmployee,
    headcount,
    last12Runs,
    deptCosts,
    maxDept,
    pendingCeoRun,
  }
}

export async function ExecutivePayrollView() {
  const data = await getExecutivePayrollData()

  return (
    <div className="space-y-6">
      {/* Dark Banner */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8 text-white shadow-lg">
        <h2 className="text-2xl font-bold">Payroll Overview</h2>
        <p className="text-sm text-slate-300 mt-2">
          Strategic payroll insights — no individual payslip data shown.
        </p>
      </div>

      {/* CEO action panel — only shows when a run is awaiting CEO review */}
      {data.pendingCeoRun && (
        <CeoReviewPanel
          runId={data.pendingCeoRun.id}
          month={data.pendingCeoRun.month}
          year={data.pendingCeoRun.year}
          totalNet={data.pendingCeoRun.totalNet}
          totalGross={data.pendingCeoRun.totalGross}
        />
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Current Month Cost"
          value={formatCurrency(data.currentMonthCost)}
          Icon={Wallet}
          color="bg-blue-50 text-blue-600"
        />
        <KpiCard
          label="YTD Total Cost"
          value={formatCurrency(data.ytdNet)}
          Icon={TrendingUp}
          color="bg-emerald-50 text-emerald-600"
        />
        <KpiCard
          label="Avg Cost / Employee"
          value={formatCurrency(Math.round(data.avgPerEmployee))}
          Icon={Banknote}
          color="bg-purple-50 text-purple-600"
        />
        <KpiCard
          label="Headcount Paid"
          value={String(data.headcount)}
          Icon={Users}
          color="bg-amber-50 text-amber-600"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 12-Month Trend */}
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>12-Month Payroll Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {data.last12Runs.length === 0 ? (
              <p className="text-sm text-slate-400">No payroll history yet.</p>
            ) : (
              <div className="space-y-2">
                {data.last12Runs.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-slate-600">
                          {monthName(r.month)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {monthName(r.month)} {r.year}
                        </p>
                        <p className="text-xs text-slate-500">
                          Gross: {formatCurrency(r.totalGross)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <p className="text-sm font-bold text-slate-900">
                        {formatCurrency(r.totalNet)}
                      </p>
                      <Badge variant={r.status === 'APPROVED' ? 'success' : 'warning'}>
                        {r.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cost by Department */}
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>
              Cost by Department — {monthName(data.month)} {data.year}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.deptCosts.length === 0 ? (
              <p className="text-sm text-slate-400">No data for current month yet.</p>
            ) : (
              <div className="space-y-3">
                {data.deptCosts.map((d) => {
                  const pct = (d.total / data.maxDept) * 100
                  return (
                    <div key={d.name}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium text-slate-700">{d.name}</span>
                        <span className="font-semibold text-slate-900">
                          {formatCurrency(d.total)}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* EOBI & Tax Panel */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>EOBI &amp; Tax Summary — YTD {data.year}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-purple-100 bg-purple-50 p-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-white">
                  <ShieldCheck className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-purple-700">Total EOBI Paid (YTD)</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">
                    {formatCurrency(data.ytdEobi)}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-white">
                  <Landmark className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-amber-700">
                    Total Income Tax Withheld (YTD)
                  </p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">
                    {formatCurrency(data.ytdTax)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
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

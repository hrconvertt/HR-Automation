import { prisma } from '@/lib/prisma'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getInitials, formatDate } from '@/lib/utils'
import { Users, UserPlus, UserMinus, Briefcase, Clock, TrendingUp } from 'lucide-react'

export async function ExecutiveWorkforceView() {
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400_000)
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400_000)

  const [
    activeEmployees,
    recentJoiners,
    recentExits,
    departments,
  ] = await Promise.all([
    prisma.employee.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        fullName: true,
        designation: true,
        employeeType: true,
        joiningDate: true,
        dob: true,
        gender: true,
        department: { select: { name: true } },
      },
    }),
    prisma.employee.findMany({
      where: { status: 'ACTIVE', joiningDate: { gte: thirtyDaysAgo } },
      select: {
        id: true,
        fullName: true,
        designation: true,
        joiningDate: true,
        department: { select: { name: true } },
      },
      orderBy: { joiningDate: 'desc' },
      take: 10,
    }),
    prisma.employee.findMany({
      where: {
        status: { in: ['RESIGNED', 'TERMINATED'] },
        exitDate: { gte: ninetyDaysAgo },
      },
      select: {
        id: true,
        fullName: true,
        designation: true,
        status: true,
        exitDate: true,
        department: { select: { name: true } },
      },
      orderBy: { exitDate: 'desc' },
      take: 10,
    }),
    prisma.department.findMany({
      include: { _count: { select: { employees: { where: { status: 'ACTIVE' } } } } },
    }),
  ])

  const totalHeadcount = activeEmployees.length
  const newHires30d = recentJoiners.length
  const exits90d = recentExits.length

  // Employee type breakdown
  const typeBuckets: Record<string, number> = {}
  activeEmployees.forEach((e) => {
    typeBuckets[e.employeeType] = (typeBuckets[e.employeeType] ?? 0) + 1
  })
  const permanent = typeBuckets['PERMANENT'] ?? 0
  const probation = typeBuckets['PROBATION'] ?? 0

  // Avg tenure
  const totalYears = activeEmployees.reduce((sum, e) => {
    return sum + (now.getTime() - new Date(e.joiningDate).getTime()) / (365.25 * 86400_000)
  }, 0)
  const avgTenure = totalHeadcount > 0 ? totalYears / totalHeadcount : 0

  // Tenure buckets
  const tenureBuckets = { '0–1 yr': 0, '1–3 yrs': 0, '3–5 yrs': 0, '5+ yrs': 0 }
  activeEmployees.forEach((e) => {
    const years = (now.getTime() - new Date(e.joiningDate).getTime()) / (365.25 * 86400_000)
    if (years < 1) tenureBuckets['0–1 yr']++
    else if (years < 3) tenureBuckets['1–3 yrs']++
    else if (years < 5) tenureBuckets['3–5 yrs']++
    else tenureBuckets['5+ yrs']++
  })

  // Gender
  const genderBuckets: Record<string, number> = {}
  activeEmployees.forEach((e) => {
    const g = (e.gender || 'Unknown').trim()
    const key = g.toLowerCase() === 'male' || g.toLowerCase() === 'm' ? 'Male'
              : g.toLowerCase() === 'female' || g.toLowerCase() === 'f' ? 'Female'
              : 'Unknown'
    genderBuckets[key] = (genderBuckets[key] ?? 0) + 1
  })

  const maxDeptCount = Math.max(...departments.map((d) => d._count.employees), 1)
  const maxTypeCount = Math.max(...Object.values(typeBuckets), 1)
  const maxTenureCount = Math.max(...Object.values(tenureBuckets), 1)

  return (
    <div className="space-y-5">
      {/* No banner — module title comes from employees/layout.tsx. */}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPI label="Headcount" value={totalHeadcount} icon={Users} color="text-slate-700 bg-slate-50" />
        <KPI label="New Hires (30d)" value={newHires30d} icon={UserPlus} color="text-slate-700 bg-slate-50" />
        <KPI label="Exits (90d)" value={exits90d} icon={UserMinus} color="text-slate-700 bg-slate-50" />
        <KPI label="Permanent" value={permanent} icon={Briefcase} color="text-slate-700 bg-slate-50" />
        <KPI label="Probation" value={probation} icon={Clock} color="text-slate-700 bg-slate-50" />
        <KPI label="Avg Tenure" value={`${avgTenure.toFixed(1)} yr`} icon={TrendingUp} color="text-slate-700 bg-slate-50" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Headcount by Department */}
        <Card>
          <CardHeader><CardTitle>Headcount by Department</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {departments
                .filter((d) => d._count.employees > 0)
                .sort((a, b) => b._count.employees - a._count.employees)
                .map((d) => (
                  <div key={d.id} className="flex items-center gap-3">
                    <span className="text-sm text-gray-700 w-44 truncate">{d.name}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-slate-500 h-2 rounded-full"
                        style={{ width: `${(d._count.employees / maxDeptCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-gray-900 w-8 text-right">{d._count.employees}</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>

        {/* Employee Type Breakdown */}
        <Card>
          <CardHeader><CardTitle>Employee Type</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(typeBuckets).map(([type, count]) => (
                <div key={type} className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 w-32">{type}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-slate-500 h-2 rounded-full"
                      style={{ width: `${(count / maxTypeCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-gray-900 w-8 text-right">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Tenure Distribution */}
        <Card>
          <CardHeader><CardTitle>Tenure Distribution</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(tenureBuckets).map(([bucket, count]) => (
                <div key={bucket} className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 w-24">{bucket}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-slate-500 h-2 rounded-full"
                      style={{ width: `${(count / maxTenureCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-gray-900 w-8 text-right">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Gender Diversity */}
        <Card>
          <CardHeader><CardTitle>Gender Diversity</CardTitle></CardHeader>
          <CardContent>
            {/* Graceful degrade: if every active employee has a null gender,
                showing 0/0/100% Unknown looks like a broken chart. Surface a
                clear empty-state with a hint for HR. */}
            {(() => {
              const known = (genderBuckets['Male'] ?? 0) + (genderBuckets['Female'] ?? 0)
              if (known === 0) {
                return (
                  <div className="py-6 text-center">
                    <p className="text-sm text-slate-500">Gender data not yet recorded.</p>
                    <p className="text-xs text-slate-400 mt-1">
                      HR can set this per employee in <span className="font-medium">People → Edit Profile</span>.
                    </p>
                  </div>
                )
              }
              return (
                <div className="grid grid-cols-3 gap-4 text-center">
                  {(['Male', 'Female', 'Unknown'] as const).map((g) => {
                    const count = genderBuckets[g] ?? 0
                    const pct = totalHeadcount > 0 ? Math.round((count / totalHeadcount) * 100) : 0
                    return (
                      <div key={g}>
                        <p className="text-2xl font-bold text-gray-900">{count}</p>
                        <p className="text-xs text-gray-500">{g} · {pct}%</p>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </CardContent>
        </Card>
      </div>

      {/* Named Recent Joiners / Recent Exits intentionally removed from
          the Executive view — the CEO doesn't need to scroll names from
          a strategic overview. HR sees these in the People module. */}
    </div>
  )
}

function KPI({
  label, value, icon: Icon, color,
}: {
  label: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  color: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <div className={`p-1.5 rounded-lg ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

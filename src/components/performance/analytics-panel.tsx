import { prisma } from '@/lib/prisma'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Award, AlertTriangle, CheckCircle2, Clock, TrendingUp, Users } from 'lucide-react'
import { getInitials } from '@/lib/utils'

interface Props {
  role: 'HR_ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'EXECUTIVE'
  employeeId: string | null
}

export async function PerformanceAnalytics({ role, employeeId }: Props) {
  // Build the same WHERE as the page
  let reviewsWhere: object = {}
  if (role === 'EMPLOYEE' && employeeId) {
    reviewsWhere = { employeeId }
  } else if (role === 'MANAGER' && employeeId) {
    reviewsWhere = {
      OR: [{ employeeId }, { employee: { reportingManagerId: employeeId } }],
    }
  }

  const [allReviews, activeEmployees, goalsAgg, openCauses, activePips] = await Promise.all([
    prisma.performanceReview.findMany({
      where: reviewsWhere,
      select: { id: true, status: true, overallRating: true, finalCategory: true, employeeId: true },
    }),
    prisma.employee.count({ where: { status: 'ACTIVE' } }),
    prisma.goal.groupBy({
      by: ['status'],
      where: role === 'EMPLOYEE' && employeeId ? { employeeId } : {},
      _count: true,
    }),
    prisma.showCause.count({
      where: {
        status: { in: ['OPEN', 'RESPONDED'] },
        ...(role === 'EMPLOYEE' && employeeId ? { employeeId } : {}),
        ...(role === 'MANAGER' && employeeId
          ? { OR: [{ employeeId }, { employee: { reportingManagerId: employeeId } }] }
          : {}),
      },
    }),
    prisma.pIP.count({
      where: {
        outcome: 'IN_PROGRESS',
        ...(role === 'EMPLOYEE' && employeeId ? { employeeId } : {}),
        ...(role === 'MANAGER' && employeeId
          ? { OR: [{ employeeId }, { employee: { reportingManagerId: employeeId } }] }
          : {}),
      },
    }),
  ])

  const totalReviews = allReviews.length
  const finalized = allReviews.filter((r) => r.status === 'HR_FINALIZED').length
  const pendingSelf = allReviews.filter((r) => r.status === 'PENDING').length
  const pendingMgr = allReviews.filter((r) => r.status === 'SELF_SUBMITTED').length
  const pendingHR = allReviews.filter((r) => r.status === 'MANAGER_REVIEWED').length
  const completionPct = totalReviews > 0 ? Math.round((finalized / totalReviews) * 100) : 0

  // Rating distribution (only for finalized)
  const buckets = { EXCEEDS: 0, MEETS: 0, BELOW: 0, UNSATISFACTORY: 0 }
  for (const r of allReviews) {
    if (r.finalCategory && r.finalCategory in buckets) {
      buckets[r.finalCategory as keyof typeof buckets]++
    }
  }
  const maxBucket = Math.max(...Object.values(buckets), 1)

  // Top performers (for HR & Manager only)
  const topPerformers = (role === 'HR_ADMIN' || role === 'MANAGER' || role === 'EXECUTIVE')
    ? await prisma.performanceReview.findMany({
        where: {
          ...reviewsWhere,
          status: 'HR_FINALIZED',
          overallRating: { gte: 4 },
        },
        orderBy: { overallRating: 'desc' },
        take: 5,
        include: {
          employee: { select: { fullName: true, designation: true, employeeCode: true } },
        },
      })
    : []

  const goalStats: Record<string, number> = {}
  goalsAgg.forEach((g) => { goalStats[g.status] = g._count })
  const totalGoals = Object.values(goalStats).reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI
          label={role === 'EMPLOYEE' ? 'My Reviews' : 'Total Reviews'}
          value={totalReviews}
          icon={TrendingUp}
          color="text-blue-600 bg-blue-50"
        />
        <KPI
          label="Completion %"
          value={`${completionPct}%`}
          icon={CheckCircle2}
          color="text-emerald-600 bg-emerald-50"
        />
        <KPI
          label="Active PIPs"
          value={activePips}
          icon={Clock}
          color="text-red-600 bg-red-50"
        />
        <KPI
          label="Open Notices"
          value={openCauses}
          icon={AlertTriangle}
          color="text-amber-600 bg-amber-50"
        />
      </div>

      {(role === 'HR_ADMIN' || role === 'EXECUTIVE') && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cycle Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <StatusBar label="Pending Self-Appraisal"   count={pendingSelf} total={totalReviews} color="bg-amber-400" />
              <StatusBar label="Pending Manager Review"   count={pendingMgr}  total={totalReviews} color="bg-blue-400" />
              <StatusBar label="Pending HR Finalization"  count={pendingHR}   total={totalReviews} color="bg-purple-400" />
              <StatusBar label="Finalized"                count={finalized}   total={totalReviews} color="bg-emerald-400" />
            </div>
            <p className="text-xs text-gray-400 mt-3">{activeEmployees} active employees in the org</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {finalized > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rating Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(buckets).map(([cat, count]) => (
                  <div key={cat} className="flex items-center gap-3">
                    <span className="text-sm text-gray-700 w-36">{cat.replace('_', ' ')}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-2 rounded-full ${
                          cat === 'EXCEEDS' ? 'bg-emerald-500' :
                          cat === 'MEETS' ? 'bg-blue-500' :
                          cat === 'BELOW' ? 'bg-amber-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${(count / maxBucket) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-gray-900 w-8 text-right">{count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {totalGoals > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Goals Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {['NOT_STARTED', 'IN_PROGRESS', 'ON_TRACK', 'AT_RISK', 'COMPLETED'].map((s) => (
                  <div key={s} className="flex items-center gap-3">
                    <span className="text-sm text-gray-700 w-32">{s.replace('_', ' ')}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-2 rounded-full ${
                          s === 'COMPLETED' ? 'bg-emerald-500' :
                          s === 'ON_TRACK' ? 'bg-blue-500' :
                          s === 'AT_RISK' ? 'bg-red-500' : 'bg-gray-400'
                        }`}
                        style={{ width: `${((goalStats[s] || 0) / totalGoals) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-gray-900 w-8 text-right">{goalStats[s] || 0}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {topPerformers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500" /> Top Performers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topPerformers.map((r) => (
                <div key={r.id} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                      {getInitials(r.employee.fullName)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{r.employee.fullName}</p>
                      <p className="text-xs text-gray-500">{r.employee.designation}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-amber-600">{r.overallRating}/5</span>
                    <Badge variant="success">{r.finalCategory}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {role === 'EMPLOYEE' && totalReviews === 0 && (
        <Card>
          <CardContent className="py-10 text-center">
            <Users className="w-8 h-8 mx-auto text-gray-300 mb-2" />
            <p className="text-gray-500 text-sm">No performance reviews yet. HR will start the next cycle soon.</p>
          </CardContent>
        </Card>
      )}
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

function StatusBar({
  label, count, total, color,
}: {
  label: string
  count: number
  total: number
  color: string
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-gray-700">{label}</span>
        <span className="text-sm font-semibold text-gray-900">{count} <span className="text-gray-400">/ {total}</span></span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
        <div className={`h-2 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

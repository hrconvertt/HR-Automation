import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import { GoalsPanel } from '@/components/performance/goals-panel'
import { OpenCycleButton } from '@/components/performance/open-cycle-button'
import { ShowCausePanel } from '@/components/performance/show-cause-panel'
import { PipPanel } from '@/components/performance/pip-panel'
import { PerformanceAnalytics } from '@/components/performance/analytics-panel'
import { TrendingUp, ExternalLink, ClipboardCheck, ArrowRight } from 'lucide-react'

export default async function PerformancePage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  if (!token) redirect('/login')
  const payload = verifyToken(token)
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  if (!user) redirect('/login')

  // Compute effective role (HR can preview as another role)
  const previewRole =
    user.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const role = (previewRole ?? user.role) as 'HR_ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'EXECUTIVE'
  const employeeId = user.employee?.id ?? null
  // HR is "previewing" when they're viewing as a non-HR role — destructive actions disabled
  const isPreviewMode = user.role === 'HR_ADMIN' && !!previewRole && previewRole !== 'HR_ADMIN'

  // Scope reviews list by role for the Reviews tab
  let reviewsWhere: object = {}
  if (role === 'EMPLOYEE' && employeeId) {
    reviewsWhere = { employeeId }
  } else if (role === 'MANAGER' && employeeId) {
    reviewsWhere = {
      OR: [
        { employeeId },
        { employee: { reportingManagerId: employeeId } },
      ],
    }
  }

  const reviews = await prisma.performanceReview.findMany({
    where: reviewsWhere,
    orderBy: [{ reviewPeriod: 'desc' }, { createdAt: 'desc' }],
    take: 100,
    include: {
      employee: {
        select: {
          fullName: true, employeeCode: true,
          reportingManager: { select: { fullName: true } },
        },
      },
    },
  })

  // Show Cause + PIP tabs visible to: HR (full), Manager (their team), Employee (their own only)
  const showDisciplinaryTabs = role !== 'EXECUTIVE'

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-6 text-white shadow-md">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-white/90" />
          Performance
        </h1>
        <p className="text-sm text-white/85 mt-1">
          {role === 'EMPLOYEE' && 'Track your goals, reviews, and growth journey.'}
          {role === 'MANAGER'  && 'Manage your team’s goals, reviews, and development.'}
          {role === 'HR_ADMIN' && 'Run review cycles, track performance across the company.'}
          {role === 'EXECUTIVE' && 'Strategic view of company-wide performance.'}
        </p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="goals">Goals</TabsTrigger>
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
          {showDisciplinaryTabs && <TabsTrigger value="showcause">Show Cause</TabsTrigger>}
          {showDisciplinaryTabs && <TabsTrigger value="pip">PIP</TabsTrigger>}
        </TabsList>

        {/* OVERVIEW TAB — Step 9 */}
        <TabsContent value="overview">
          <PerformanceAnalytics role={role} employeeId={employeeId} />
        </TabsContent>

        {/* GOALS TAB — Step 1 */}
        <TabsContent value="goals">
          <GoalsPanel role={role} employeeId={employeeId} isPreviewMode={isPreviewMode} />
        </TabsContent>

        {/* REVIEWS TAB — Step 2 */}
        <TabsContent value="reviews">
          <div className="space-y-4">
            {/* Self-review CTA — surfaces the most-recent pending self-appraisal */}
            {role === 'EMPLOYEE' && employeeId && (() => {
              const myPending = reviews.find(
                (r) => r.employeeId === employeeId && r.status === 'PENDING',
              )
              if (!myPending) return null
              return (
                <Card className="bg-gradient-to-r from-slate-50 to-slate-50 border-slate-100 p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-start gap-3">
                      <div className="rounded-full bg-slate-700/10 p-2.5">
                        <ClipboardCheck className="w-5 h-5 text-slate-700" />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-gray-900">Complete Your Self-Review</h3>
                        <p className="text-sm text-gray-600 mt-1">
                          Your <strong>{myPending.reviewType.replace('_', ' ')}</strong> review for{' '}
                          <strong>{myPending.reviewPeriod}</strong> is open. Rate your performance and share your achievements so your manager can review.
                        </p>
                      </div>
                    </div>
                    <Link href={`/dashboard/performance/${myPending.id}`}>
                      <Button>
                        Start Self-Review
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  </div>
                </Card>
              )
            })()}

            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Performance Reviews</h2>
                <p className="text-sm text-gray-500">{reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}</p>
              </div>
              {role === 'HR_ADMIN' && !isPreviewMode && <OpenCycleButton />}
            </div>
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reviewer</TableHead>
                    <TableHead>Overall Rating</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviews.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-10 text-gray-400">
                      No reviews yet.
                      {role === 'HR_ADMIN' && <span className="block mt-1 text-sm">Click &quot;Open Review Cycle&quot; to start.</span>}
                    </TableCell></TableRow>
                  ) : (
                    reviews.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <p className="font-medium">{r.employee.fullName}</p>
                          <p className="text-xs text-gray-400">{r.employee.employeeCode}</p>
                        </TableCell>
                        <TableCell>{r.reviewPeriod}</TableCell>
                        <TableCell><Badge variant="secondary">{r.reviewType.replace('_', ' ')}</Badge></TableCell>
                        <TableCell className="text-sm text-gray-600">{r.employee.reportingManager?.fullName ?? '—'}</TableCell>
                        <TableCell>{r.overallRating ? `${r.overallRating}/5` : '—'}</TableCell>
                        <TableCell>
                          <Badge variant={
                            r.status === 'HR_FINALIZED' ? 'success' :
                            r.status === 'MANAGER_REVIEWED' ? 'default' :
                            r.status === 'SELF_SUBMITTED' ? 'default' : 'warning'
                          }>
                            {r.status.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Link href={`/dashboard/performance/${r.id}`}>
                            <Button size="sm" variant="ghost">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          </div>
        </TabsContent>

        {showDisciplinaryTabs && (
          <TabsContent value="showcause">
            <ShowCausePanel role={role} employeeId={employeeId} isPreviewMode={isPreviewMode} />
          </TabsContent>
        )}

        {showDisciplinaryTabs && (
          <TabsContent value="pip">
            <PipPanel role={role} isPreviewMode={isPreviewMode} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

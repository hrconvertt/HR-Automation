import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, User, Calendar, ClipboardCheck } from 'lucide-react'
import { ReviewForm } from '@/components/performance/review-form'
import { suggestedOverallRating } from '@/lib/performance-metrics'

interface PageProps { params: Promise<{ id: string }> }

export default async function ReviewDetailPage({ params }: PageProps) {
  const { id } = await params
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

  const previewRole =
    user.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = (previewRole ?? user.role) as string
  const myEmpId = user.employee?.id ?? null

  const review = await prisma.performanceReview.findUnique({
    where: { id },
    include: {
      employee: {
        select: {
          id: true, employeeCode: true, fullName: true, designation: true,
          department: { select: { name: true } },
          reportingManager: { select: { id: true, fullName: true } },
          reportingManagerId: true,
        },
      },
      goals: true,
    },
  })
  if (!review) notFound()

  const isOwn = review.employeeId === myEmpId
  const isMyTeamMember = review.employee.reportingManagerId === myEmpId
  const isHR = effectiveRole === 'HR_ADMIN'
  const isExec = effectiveRole === 'EXECUTIVE'

  if (!isOwn && !isMyTeamMember && !isHR && !isExec) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-xl">
        <p className="font-semibold text-red-700">Access denied</p>
        <p className="text-sm text-red-600 mt-1">You don&apos;t have permission to view this review.</p>
      </div>
    )
  }

  const statusVariant: Record<string, 'success' | 'default' | 'warning' | 'secondary'> = {
    PENDING: 'warning',
    SELF_SUBMITTED: 'default',
    MANAGER_REVIEWED: 'default',
    HR_FINALIZED: 'success',
  }

  return (
    <div className="space-y-5">
      <Link href="/dashboard/performance" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
        <ArrowLeft className="w-4 h-4" /> Back to Performance
      </Link>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{review.employee.fullName}</h1>
            <p className="text-sm text-gray-500">
              {review.employee.designation} · {review.employee.department?.name ?? '—'} · <span className="font-mono">{review.employee.employeeCode}</span>
            </p>
            <div className="flex items-center gap-4 mt-3 text-sm">
              <span className="flex items-center gap-1.5 text-gray-700">
                <Calendar className="w-4 h-4 text-gray-400" /> <strong>{review.reviewPeriod}</strong> · {review.reviewType.replace('_', ' ')}
              </span>
              <span className="flex items-center gap-1.5 text-gray-700">
                <User className="w-4 h-4 text-gray-400" /> Reviewer: {review.employee.reportingManager?.fullName ?? '—'}
              </span>
            </div>
          </div>
          <Badge variant={statusVariant[review.status] ?? 'secondary'} className="text-sm px-3 py-1">
            {review.status.replace('_', ' ')}
          </Badge>
        </div>

        {/* Progress timeline */}
        <div className="mt-5 flex items-center gap-2 text-xs">
          {['PENDING', 'SELF_SUBMITTED', 'MANAGER_REVIEWED', 'HR_FINALIZED'].map((s, i) => {
            const stageNames = ['Pending', 'Self-Appraisal', 'Manager Review', 'HR Finalized']
            const currentIdx = ['PENDING', 'SELF_SUBMITTED', 'MANAGER_REVIEWED', 'HR_FINALIZED'].indexOf(review.status)
            const isCurrent = currentIdx === i
            const isPast = currentIdx > i
            return (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  isPast ? 'bg-green-500 text-white' :
                  isCurrent ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  {isPast ? '✓' : i + 1}
                </div>
                <span className={isPast || isCurrent ? 'text-gray-900 font-medium' : 'text-gray-400'}>{stageNames[i]}</span>
                {i < 3 && <div className={`w-8 h-px ${isPast ? 'bg-green-400' : 'bg-gray-200'}`} />}
              </div>
            )
          })}
        </div>
      </div>

      {/* Form / Read-only views */}
      <ReviewForm
        suggestedOverall={
          isHR
            ? suggestedOverallRating({
                individualScore: review.individualScore,
                timeScore: review.timeScore,
                behavioralAvg: review.behavioralAvg,
              })
            : null
        }
        review={{
          id: review.id,
          status: review.status,
          selfRating: review.selfRating,
          managerRating: review.managerRating,
          teamworkScore: review.teamworkScore,
          ownershipScore: review.ownershipScore,
          communicationScore: review.communicationScore,
          reliabilityScore: review.reliabilityScore,
          behavioralAvg: review.behavioralAvg,
          individualScore: review.individualScore,
          teamScore: review.teamScore,
          overallRating: review.overallRating,
          finalCategory: review.finalCategory,
          achievements: review.achievements,
          learnings: review.learnings,
          teamContribution: review.teamContribution,
          managerFeedback: review.managerFeedback,
          // Time & Work auto-metrics
          cycleStartDate: review.cycleStartDate?.toISOString() ?? null,
          cycleEndDate: review.cycleEndDate?.toISOString() ?? null,
          daysWorked: review.daysWorked,
          daysAbsent: review.daysAbsent,
          daysOnLeave: review.daysOnLeave,
          lateArrivalCount: review.lateArrivalCount,
          avgHoursPerDay: review.avgHoursPerDay,
          goalsOnTime: review.goalsOnTime,
          goalsLate: review.goalsLate,
          timeScore: review.timeScore,
          goals: review.goals.map((g) => ({
            id: g.id,
            goalId: g.goalId,
            description: g.description,
            kpi: g.kpi,
            target: g.target,
            weight: g.weight,
            status: g.status,
            selfComment: g.selfComment,
            managerComment: g.managerComment,
            achievement: g.achievement,
          })),
        }}
        permissions={{ isOwn, isMyTeamMember, isHR, isExec }}
      />

      {/* Goals snapshot for this employee */}
      {review.goals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="w-4 h-4 text-blue-600" />
              Goals Linked to This Review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {review.goals.map((g) => (
                <li key={g.id} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0">
                  <span className="text-gray-800">{g.description}</span>
                  <Badge variant="secondary">{g.status}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

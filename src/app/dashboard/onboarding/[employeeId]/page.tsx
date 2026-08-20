import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { buildDay1Schedule } from '@/lib/day1-schedule'
import { buildStandardOnboardingTasks } from '@/lib/onboarding-tasks'
import { verifyToken } from '@/lib/auth'
import { Card } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import { OnboardingWorkspace } from './workspace-client'

interface PageProps {
  params: Promise<{ employeeId: string }>
}

export default async function OnboardingWorkspacePage({ params }: PageProps) {
  const { employeeId } = await params
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, employee: { select: { id: true } } },
  })
  if (!me) redirect('/login')

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: {
      department: true,
      reportingManager: { select: { id: true, fullName: true } },
      onboarding: { include: { tasks: { orderBy: [{ category: 'asc' }, { orderIndex: 'asc' }] } } },
    },
  })
  if (!employee) notFound()
  // Onboarding workspace is not meaningful for exited employees.
  if (['RESIGNED', 'TERMINATED', 'INACTIVE', 'LAYOFF'].includes(employee.status)) {
    redirect('/dashboard/onboarding')
  }

  // A workspace with no tasks was showing an empty state and a button asking
  // HR to press "Apply Standard Checklist" — a question with one right answer,
  // asked every time. The seventeen standard tasks are seeded here instead, so
  // the page opens on the checklist rather than on an errand.
  let tasks = employee.onboarding?.tasks ?? []
  if (tasks.length === 0) {
    const checklistId = employee.onboarding?.id
      ?? (await prisma.onboardingChecklist.create({ data: { employeeId } })).id
    const seeds = buildStandardOnboardingTasks(employee.employeeType)
    await prisma.onboardingTask.createMany({
      data: seeds.map((t) => ({
        checklistId,
        title: t.title,
        owner: t.owner,
        category: t.category,
        orderIndex: t.orderIndex,
        description: t.description ?? null,
        isEmployeeUploadable: t.isEmployeeUploadable ?? false,
        documentType: t.documentType ?? null,
      })),
      skipDuplicates: true,
    })
    tasks = await prisma.onboardingTask.findMany({
      where: { checklistId },
      orderBy: [{ category: 'asc' }, { orderIndex: 'asc' }],
    })
  }

  // Auth: HR_ADMIN, the hire's manager, or the hire themselves.
  const isHR = me.role === 'HR_ADMIN'
  const isManager = me.role === 'MANAGER' && me.employee?.id === employee.reportingManagerId
  const isSelf = me.employee?.id === employee.id
  if (!isHR && !isManager && !isSelf) {
    redirect('/dashboard/onboarding')
  }

  const total = tasks.length
  // NOT_REQUIRED counts as completed for progress %.
  const done = tasks.filter((t) => t.status === 'COMPLETED' || t.status === 'NOT_REQUIRED' || t.isComplete).length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const today = new Date()
  const daysSinceJoin = Math.floor((today.getTime() - new Date(employee.joiningDate).getTime()) / 86400000)
  const canComplete = isHR && pct === 100 && daysSinceJoin >= 30

  return (
    <div className="space-y-5">
      <Card className="rounded-xl border-slate-200 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">Onboarding Workspace</p>
            <h2 className="text-xl font-bold text-slate-900">{employee.fullName}</h2>
            <p className="text-sm text-slate-600">{employee.designation} · {employee.employeeCode}</p>
            <p className="text-xs text-slate-500 mt-1">
              Joined {formatDate(employee.joiningDate)} · {daysSinceJoin} days in ·
              Manager: {employee.reportingManager?.fullName ?? '—'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold tabular-nums text-slate-900">{pct}%</p>
            <p className="text-xs text-slate-500">{done} of {total} tasks done</p>
            <div className="w-40 h-2 mt-2 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full ${pct === 100 ? 'bg-slate-500' : 'bg-slate-500'}`} style={{ width: `${pct}%` }} />
            </div>
            <Link href="/dashboard/onboarding" className="text-xs text-slate-700 hover:underline mt-2 inline-block">
              ← Back to Onboarding
            </Link>
          </div>
        </div>
      </Card>

      <OnboardingWorkspace
        employeeId={employee.id}
        checklistId={employee.onboarding?.id ?? ''}
        day1Schedule={employee.onboarding?.day1ScheduleJson ?? ''}
        // Nothing saved yet? Offer a draft built from the role rather than an
        // empty box. It is not written to the record until HR saves it.
        day1Suggestion={buildDay1Schedule({
          fullName: employee.fullName,
          designation: employee.designation,
          department: employee.department?.name ?? null,
          managerName: employee.reportingManager?.fullName ?? null,
          employeeType: employee.employeeType,
        })}
        notes={employee.onboarding?.notes ?? ''}
        tasks={tasks.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          owner: t.owner,
          category: t.category,
          orderIndex: t.orderIndex,
          isComplete: t.isComplete,
          completedAt: t.completedAt?.toISOString() ?? null,
          status: t.status ?? (t.isComplete ? 'COMPLETED' : 'PENDING'),
          notRequiredReason: t.notRequiredReason ?? null,
          attachedDocumentId: t.attachedDocumentId ?? null,
          documentType: t.documentType ?? null,
          isEmployeeUploadable: t.isEmployeeUploadable ?? false,
        }))}
        canEdit={isHR}
        canMarkComplete={canComplete}
        viewerRole={me.role}
        joiningDate={employee.joiningDate.toISOString()}
        employeeName={employee.fullName}
        toEmail={employee.personalEmail ?? employee.email}
        documentsRequestedAt={employee.onboarding?.documentsRequestedAt?.toISOString() ?? null}
        infoFormSubmittedAt={employee.infoFormSubmittedAt?.toISOString() ?? null}
      />
    </div>
  )
}

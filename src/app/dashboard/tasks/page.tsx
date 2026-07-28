import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { TasksClient } from './tasks-client'

export default async function TasksPage() {
  const c = await cookies()
  const tok = c.get('hr_token')?.value
  const payload = await verifyToken(tok)
  if (!payload) redirect('/login')

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, employee: { select: { id: true, fullName: true } } },
  })
  if (!me) redirect('/login')
  const previewRole = me.role === 'HR_ADMIN' ? c.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? me.role
  const isHR = effectiveRole === 'HR_ADMIN'
  const isManager = effectiveRole === 'MANAGER'
  const myEmpId = me.employee?.id ?? null

  const [myTasks, teamTasks, templates, departments, reports] = await Promise.all([
    myEmpId
      ? prisma.taskAssignment.findMany({
          where: { employeeId: myEmpId },
          include: { template: { select: { name: true, expectedHours: true, complexity: true } } },
          orderBy: { assignedAt: 'desc' },
          take: 200,
        })
      : Promise.resolve([]),
    (isHR || isManager) && myEmpId
      ? prisma.taskAssignment.findMany({
          where: isHR
            ? {}
            : { employee: { reportingManagerId: myEmpId } },
          include: {
            template: { select: { name: true, expectedHours: true, complexity: true } },
            employee: { select: { id: true, fullName: true, employeeCode: true } },
          },
          orderBy: { assignedAt: 'desc' },
          take: 300,
        })
      : Promise.resolve([]),
    prisma.taskTemplate.findMany({
      where: { isActive: true },
      include: { department: { select: { name: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.department.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    (isHR || isManager) && myEmpId
      ? prisma.employee.findMany({
          where: isHR ? { status: 'ACTIVE' } : { reportingManagerId: myEmpId, status: 'ACTIVE' },
          select: { id: true, fullName: true, designation: true },
          orderBy: { fullName: 'asc' },
        })
      : Promise.resolve([]),
  ])

  return (
    <TasksClient
      role={effectiveRole}
      myTasks={myTasks.map((t) => serializeTask(t))}
      teamTasks={teamTasks.map((t) => serializeTask(t))}
      templates={templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        expectedHours: t.expectedHours,
        complexity: t.complexity,
        departmentName: t.department?.name ?? null,
        departmentId: t.departmentId,
        isActive: t.isActive,
      }))}
      departments={departments}
      reports={reports}
    />
  )
}

interface TaskRow {
  id: string
  status: string
  assignedAt: Date
  startedAt: Date | null
  completedAt: Date | null
  actualHours: number | null
  qualityScore: number | null
  efficiency: number | null
  delayReason: string | null
  delayJustified: boolean
  customName: string | null
  customExpectedHours: number | null
  notes: string | null
  employee?: { id: string; fullName: string; employeeCode: string } | null
  template?: { name: string; expectedHours: number; complexity: string } | null
}

function serializeTask(t: TaskRow) {
  return {
    id: t.id,
    status: t.status,
    assignedAt: t.assignedAt.toISOString(),
    startedAt: t.startedAt?.toISOString() ?? null,
    completedAt: t.completedAt?.toISOString() ?? null,
    actualHours: t.actualHours,
    qualityScore: t.qualityScore,
    efficiency: t.efficiency,
    delayReason: t.delayReason,
    delayJustified: t.delayJustified,
    customName: t.customName,
    customExpectedHours: t.customExpectedHours,
    notes: t.notes,
    employee: t.employee ?? null,
    template: t.template ?? null,
  }
}

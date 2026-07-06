import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import TerminationDetailClient from './_client'

interface PageProps { params: Promise<{ id: string }> }

export default async function TerminationDetailPage({ params }: PageProps) {
  const { id } = await params
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const previewRole =
    payload.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? payload.role

  const t = await prisma.termination.findUnique({
    where: { id },
    include: {
      employee: {
        select: {
          id: true, fullName: true, employeeCode: true, designation: true,
          joiningDate: true, email: true,
          department: { select: { name: true } },
          reportingManager: { select: { fullName: true } },
        },
      },
    },
  })
  if (!t) notFound()

  // Auth: HR + Exec see all; affected employee sees their own workflow
  // (so notification links + email CTAs don't dead-end). Everyone else 403.
  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { employee: { select: { id: true } } },
  })
  const isHR = effectiveRole === 'HR_ADMIN'
  const isExec = effectiveRole === 'EXECUTIVE'
  const isSelf = me?.employee?.id === t.employeeId
  if (!isHR && !isExec && !isSelf) {
    redirect('/dashboard')
  }

  // Only actual HR (not preview mode, not the affected employee) can drive
  // stage transitions from the detail view.
  const canAct = effectiveRole === 'HR_ADMIN' && payload.role === 'HR_ADMIN'

  return <TerminationDetailClient initial={JSON.parse(JSON.stringify(t))} canAct={canAct} />
}

import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import ExitClearanceDetailClient from './_client'

interface PageProps { params: Promise<{ id: string }> }

export default async function ExitClearanceDetailPage({ params }: PageProps) {
  const { id } = await params
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, employee: { select: { id: true } } },
  })
  if (!me) redirect('/login')

  const previewRole =
    payload.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? payload.role

  const clearance = await prisma.exitClearance.findUnique({
    where: { id },
    include: {
      employee: {
        select: {
          id: true, fullName: true, employeeCode: true, designation: true,
          status: true, joiningDate: true, exitDate: true,
          department: { select: { name: true } },
          reportingManager: { select: { id: true, fullName: true } },
          assets: { where: { returnedDate: null }, include: { asset: { select: { name: true, type: true, serialNo: true } } } },
        },
      },
    },
  })
  if (!clearance) notFound()

  // Mirror of the API access rule: HR sees everything; the departing
  // employee can view (acknowledgment + handover steps). Everyone else out.
  const isHR = effectiveRole === 'HR_ADMIN'
  const isSelf = me.employee?.id === clearance.employeeId
  if (!isHR && !isSelf) redirect('/dashboard/lifecycle/exit')

  // Only actual (non-previewing) HR drives clearance actions.
  const canAct = effectiveRole === 'HR_ADMIN' && payload.role === 'HR_ADMIN'

  return (
    <ExitClearanceDetailClient
      initial={JSON.parse(JSON.stringify(clearance))}
      canAct={canAct}
      isSelf={isSelf}
    />
  )
}

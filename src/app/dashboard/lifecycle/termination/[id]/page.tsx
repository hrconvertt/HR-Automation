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
  if (!token) redirect('/login')
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const previewRole =
    payload.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? payload.role
  if (effectiveRole !== 'HR_ADMIN' && effectiveRole !== 'EXECUTIVE') {
    redirect('/dashboard')
  }

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

  const canAct = effectiveRole === 'HR_ADMIN' && payload.role === 'HR_ADMIN'

  return <TerminationDetailClient initial={JSON.parse(JSON.stringify(t))} canAct={canAct} />
}

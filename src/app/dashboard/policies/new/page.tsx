/** Policies → New policy. HR only — the guided policy builder. */
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { talentViewer } from '@/lib/talent'
import { blankState, extractCode, todayIso } from '@/lib/policy-builder'
import { PolicyBuilder } from '@/components/policies/policy-builder'

export default async function NewPolicyPage() {
  const viewer = await talentViewer()
  if (!viewer) redirect('/login')
  if (viewer.actualRole !== 'HR_ADMIN' || viewer.isPreviewMode) redirect('/dashboard/policies')

  const [policies, people, departments] = await Promise.all([
    prisma.policyDocument.findMany({ orderBy: { title: 'asc' }, select: { id: true, title: true, category: true, status: true, content: true } }),
    prisma.employee.findMany({ where: { status: 'ACTIVE', deletedAt: null }, orderBy: { fullName: 'asc' }, select: { id: true, fullName: true, designation: true } }),
    prisma.department.findMany({ orderBy: { name: 'asc' }, select: { name: true } }),
  ])

  return (
    <PolicyBuilder
      mode="create"
      initial={blankState(todayIso())}
      existing={policies.map((p) => ({ id: p.id, title: p.title, category: p.category, status: p.status, code: extractCode(p.content) }))}
      people={people}
      departments={departments.map((d) => d.name)}
    />
  )
}

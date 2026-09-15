/**
 * Policies → Edit policy. HR only.
 *
 * Opens any policy — one made in the builder or imported from the Playbook —
 * back into the builder's fields. Anything the builder does not recognise is
 * kept as its own section, so nothing is lost by opening and saving.
 */
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { talentViewer } from '@/lib/talent'
import { parseAudienceRoles } from '@/lib/policy-access'
import { extractCode, parsePolicy } from '@/lib/policy-builder'
import { PolicyBuilder } from '@/components/policies/policy-builder'

export default async function EditPolicyPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await talentViewer()
  if (!viewer) redirect('/login')
  if (viewer.actualRole !== 'HR_ADMIN' || viewer.isPreviewMode) redirect('/dashboard/policies')
  const { id } = await params

  const [policy, policies, people, departments] = await Promise.all([
    prisma.policyDocument.findUnique({ where: { id } }),
    prisma.policyDocument.findMany({ orderBy: { title: 'asc' }, select: { id: true, title: true, category: true, status: true, content: true } }),
    prisma.employee.findMany({ where: { status: 'ACTIVE', deletedAt: null }, orderBy: { fullName: 'asc' }, select: { id: true, fullName: true, designation: true } }),
    prisma.department.findMany({ orderBy: { name: 'asc' }, select: { name: true } }),
  ])
  if (!policy) notFound()

  const initial = parsePolicy(policy.content, {
    title: policy.title,
    description: policy.description,
    category: policy.category,
    type: policy.type,
    version: policy.version,
    effectiveDate: policy.effectiveDate ? policy.effectiveDate.toISOString() : null,
    url: policy.url,
    audienceRoles: parseAudienceRoles(policy.audienceRoles),
  })

  return (
    <PolicyBuilder
      mode="edit"
      policyId={policy.id}
      status={policy.status}
      initial={initial}
      existing={policies.map((p) => ({ id: p.id, title: p.title, category: p.category, status: p.status, code: extractCode(p.content) }))}
      people={people}
      departments={departments.map((d) => d.name)}
    />
  )
}

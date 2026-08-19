/**
 * One verification: the two columns, the correspondence, the decision.
 */

import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { VerificationDetail } from '../_components/verification-detail'

interface PageProps { params: Promise<{ id: string }> }

/** Stored JSON, defensively — a bad row should not blank the page. */
function parse(json: string | null): Record<string, string> {
  if (!json) return {}
  try {
    const v = JSON.parse(json)
    return v && typeof v === 'object' ? (v as Record<string, string>) : {}
  } catch { return {} }
}

export default async function VerificationDetailPage({ params }: PageProps) {
  const { id } = await params
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')
  const role = cookieStore.get('hr_preview_role')?.value ?? payload.role
  if (role !== 'HR_ADMIN') {
    return (
      <div className="rounded-2xl bg-slate-50 border border-slate-100 p-6">
        <h2 className="text-lg font-semibold text-slate-900">Access denied</h2>
        <p className="text-sm text-slate-600 mt-2">
          Background verification is HR-only — it holds references and personal history.
        </p>
      </div>
    )
  }

  const [v, staff] = await Promise.all([
    prisma.backgroundVerification.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true, fullName: true, employeeCode: true, designation: true,
            department: { select: { name: true } },
          },
        },
        emails: { orderBy: { occurredAt: 'asc' } },
      },
    }),
    prisma.employee.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    }),
  ])
  if (!v) notFound()

  return (
    <VerificationDetail
      staff={staff}
      employee={{
        id: v.employee.id,
        fullName: v.employee.fullName,
        employeeCode: v.employee.employeeCode,
        designation: v.employee.designation,
        department: v.employee.department?.name ?? null,
      }}
      check={{
        id: v.id,
        employerName: v.employerName,
        contactName: v.contactName ?? '',
        contactRole: v.contactRole ?? '',
        contactEmail: v.contactEmail ?? '',
        contactPhone: v.contactPhone ?? '',
        status: v.status,
        assignedToId: v.assignedToId ?? '',
        consentAt: v.consentAt?.toISOString() ?? null,
        requestedAt: v.requestedAt?.toISOString() ?? null,
        respondedAt: v.respondedAt?.toISOString() ?? null,
        outcome: v.outcome,
        decisionNote: v.decisionNote ?? '',
        claimed: parse(v.claimedJson),
        verified: parse(v.verifiedJson),
        emails: v.emails.map((e) => ({
          id: e.id,
          direction: e.direction,
          fromAddress: e.fromAddress,
          toAddress: e.toAddress,
          subject: e.subject,
          body: e.body,
          occurredAt: e.occurredAt.toISOString(),
        })),
      }}
    />
  )
}

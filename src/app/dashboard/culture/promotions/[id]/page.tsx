/**
 * One promotion: the form, the gates, the signature, the letter.
 */

import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PromotionForm } from '../_components/promotion-form'

interface PageProps { params: Promise<{ id: string }> }

export default async function PromotionDetailPage({ params }: PageProps) {
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
          Promotions are HR-only — they carry salary and band information.
        </p>
      </div>
    )
  }

  const p = await prisma.promotionRequest.findUnique({
    where: { id },
    include: {
      employee: {
        select: {
          id: true, fullName: true, employeeCode: true, designation: true,
          joiningDate: true,
          department: { select: { name: true } },
          reportingManager: { select: { fullName: true } },
        },
      },
    },
  })
  if (!p) notFound()

  return (
    <PromotionForm
      employee={{
        fullName: p.employee.fullName,
        employeeCode: p.employee.employeeCode,
        designation: p.employee.designation,
        department: p.employee.department?.name ?? null,
        managerName: p.employee.reportingManager?.fullName ?? null,
        joiningDate: p.employee.joiningDate?.toISOString() ?? null,
      }}
      promotion={{
        id: p.id,
        status: p.status,
        effectiveDate: p.effectiveDate.toISOString().slice(0, 10),
        fromDesignation: p.fromDesignation ?? '',
        newDesignation: p.newDesignation,
        fromLevel: p.fromLevel ?? '',
        toLevel: p.toLevel ?? '',
        fromSalaryAmount: p.fromSalaryAmount,
        newSalaryAmount: p.newSalaryAmount,
        bandMin: p.bandMin,
        bandMax: p.bandMax,
        reason: p.reason ?? '',
        evidence: p.evidence ?? '',
        sponsorName: p.sponsorName ?? '',
        sponsorship: p.sponsorship ?? '',
        fairnessNote: p.fairnessNote ?? '',
        fairnessCheckedBy: p.fairnessCheckedBy ?? '',
        businessNeed: p.businessNeed ?? '',
        signedByName: p.signedByName ?? '',
        signedByTitle: p.signedByTitle ?? '',
        signatureDataUrl: p.signatureDataUrl,
        signedAt: p.signedAt?.toISOString() ?? null,
        letterBody: p.letterBody,
        letterGeneratedAt: p.letterGeneratedAt?.toISOString() ?? null,
      }}
    />
  )
}

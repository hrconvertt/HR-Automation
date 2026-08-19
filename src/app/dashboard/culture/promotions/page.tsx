/**
 * Promotions — the list, and the way in to a new one.
 *
 * A promotion here is the Playbook's version: four gates and then a letter,
 * not a title change typed into an employee record. The list shows how far
 * each one has got through those gates so an unfinished case is visible
 * rather than forgotten.
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CultureHeader } from '../_components/culture-header'
import { PromotionsList } from './_components/promotions-list'

export default async function PromotionsPage() {
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

  const [promotions, staff] = await Promise.all([
    prisma.promotionRequest.findMany({
      orderBy: { effectiveDate: 'desc' },
      include: {
        employee: { select: { id: true, fullName: true, employeeCode: true, designation: true } },
      },
    }),
    prisma.employee.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, fullName: true, designation: true, employeeCode: true },
      orderBy: { fullName: 'asc' },
    }),
  ])

  return (
    <div className="space-y-5">
      <CultureHeader subtitle="Promotions — evidence, sponsorship, fairness, then the letter." />
      <PromotionsList
        staff={staff}
        rows={promotions.map((p) => ({
          id: p.id,
          employeeName: p.employee.fullName,
          employeeCode: p.employee.employeeCode,
          fromDesignation: p.fromDesignation,
          newDesignation: p.newDesignation,
          fromLevel: p.fromLevel,
          toLevel: p.toLevel,
          effectiveDate: p.effectiveDate.toISOString(),
          status: p.status,
          fromSalaryAmount: p.fromSalaryAmount,
          newSalaryAmount: p.newSalaryAmount,
          hasLetter: !!p.letterBody,
          signed: !!p.signatureDataUrl,
          evidence: p.evidence,
          sponsorship: p.sponsorship,
          sponsorName: p.sponsorName,
          fairnessNote: p.fairnessNote,
          businessNeed: p.businessNeed,
          signatureDataUrl: p.signatureDataUrl,
        }))}
      />
    </div>
  )
}

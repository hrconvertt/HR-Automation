/**
 * Promotion Events — the celebration, not the paperwork.
 *
 * Every promotion in the system gets one of these: the announcement, the
 * certificate, the cake and the kudos, in one place, so a promotion is never
 * approved on paper and then quietly not celebrated.
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CultureHeader } from '../_components/culture-header'
import { CultureTabs } from '../_components/culture-tabs'
import { PromotionEvents } from './_components/promotion-events'

export default async function PromotionEventsPage() {
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')
  const role = cookieStore.get('hr_preview_role')?.value ?? payload.role
  const isHR = role === 'HR_ADMIN'
  if (!isHR && role !== 'EXECUTIVE') {
    return (
      <div className="rounded-2xl bg-slate-50 border border-slate-100 p-6">
        <h2 className="text-lg font-semibold text-slate-900">Access denied</h2>
        <p className="text-sm text-slate-600 mt-2">
          Promotion events are visible to HR and the executive team.
        </p>
      </div>
    )
  }

  const promotions = await prisma.promotionRequest.findMany({
    where: { status: { not: 'REJECTED' } },
    orderBy: { effectiveDate: 'desc' },
    take: 60,
    include: {
      employee: {
        select: {
          id: true, fullName: true, joiningDate: true,
          department: { select: { name: true } },
        },
      },
    },
  })

  // Kudos already posted for these people, so the wall is not spammed twice.
  const kudos = await prisma.kudos.findMany({
    where: { toId: { in: promotions.map((p) => p.employee.id) } },
    select: { toId: true, message: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
  const kudosBy = new Map<string, { message: string; createdAt: Date }>()
  for (const k of kudos) if (!kudosBy.has(k.toId)) kudosBy.set(k.toId, k)

  return (
    <div className="space-y-5">
      <CultureHeader subtitle="Announcement, certificate, cake, kudos — the whole small celebration." />
      <CultureTabs />
      <PromotionEvents
        isHR={isHR}
        rows={promotions.map((p) => ({
          id: p.id,
          employeeId: p.employee.id,
          employeeName: p.employee.fullName,
          department: p.employee.department?.name ?? null,
          joinedOn: p.employee.joiningDate?.toISOString() ?? null,
          fromDesignation: p.fromDesignation,
          toDesignation: p.newDesignation,
          effectiveDate: p.effectiveDate.toISOString(),
          status: p.status,
          kudosPosted: kudosBy.has(p.employee.id),
        }))}
      />
    </div>
  )
}

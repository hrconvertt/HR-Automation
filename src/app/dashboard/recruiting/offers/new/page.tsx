import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { OfferLetterBuilder } from './_components/offer-letter-builder'

/**
 * Offer letter builder. Same gate as the rest of recruiting — issuing an offer
 * is HR / hiring-manager work.
 */
export default async function NewOfferLetterPage() {
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')

  const previewRole =
    payload.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? payload.role
  if (!['HR_ADMIN', 'MANAGER'].includes(effectiveRole)) {
    return (
      <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl">
        <h2 className="text-lg font-semibold text-slate-900">Access denied</h2>
        <p className="text-sm text-slate-600 mt-2">Only HR and hiring managers can issue offers.</p>
        <Link href="/dashboard/recruiting/offers" className="text-sm text-slate-700 underline mt-3 inline-block">
          Back to Offers
        </Link>
      </div>
    )
  }

  const departments = await prisma.department.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="space-y-4">
      {/* print-hide: the header is app chrome, not part of the letter. */}
      <div className="print-hide">
        <Link
          href="/dashboard/recruiting/offers"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Offers
        </Link>
        <h2 className="text-lg font-semibold text-slate-900 mt-1">New Offer Letter</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Fill in the terms on the left. The letter builds on the right and prints exactly as shown.
        </p>
      </div>

      <OfferLetterBuilder departments={departments} />
    </div>
  )
}

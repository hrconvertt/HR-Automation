/**
 * Performance → Talent review.
 *
 * The nine-box, built on the appraisal scores rather than beside them.
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { currentCycle } from '@/lib/talent-grid'
import { TalentGridClient } from './_components/talent-grid-client'

export default async function TalentReviewPage(
  { searchParams }: { searchParams: Promise<{ cycle?: string }> },
) {
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')
  const role = cookieStore.get('hr_preview_role')?.value ?? payload.role
  if (role !== 'HR_ADMIN' && role !== 'EXECUTIVE') redirect('/dashboard/performance')

  const sp = await searchParams
  const cycle = sp.cycle || currentCycle()

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Talent review · {cycle}</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Performance against potential. Performance is read off the appraisal score, so this
          grid and the form cannot disagree about the same person.
        </p>
      </div>
      <TalentGridClient cycle={cycle} />
    </div>
  )
}

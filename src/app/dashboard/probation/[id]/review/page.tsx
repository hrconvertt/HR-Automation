/**
 * /dashboard/probation/[id]/review — the probationary performance review form.
 *
 * Opens in the last ten days of probation, which is when there is enough to
 * judge and still time to act on it.
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { ProbationReviewForm } from './_components/review-form'

export default async function ProbationReviewPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')

  return <ProbationReviewForm id={id} />
}

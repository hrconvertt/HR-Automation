/**
 * /dashboard/time/overtime — the overtime record.
 *
 * ?tab=approved is the sidebar's "OT Approved" entry: the same table filtered,
 * mirroring Leave Requests / Leave Approved.
 */

import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { OvertimeBoard } from './_components/overtime-board'

export default async function OvertimePage() {
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')

  return (
    <Suspense fallback={<p className="text-sm text-slate-400 py-10">Loading…</p>}>
      <OvertimeBoard />
    </Suspense>
  )
}

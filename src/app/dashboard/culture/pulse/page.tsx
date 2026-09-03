/**
 * Culture → Pulse.
 *
 * The one thing the culture module could not do: say how people feel. It
 * measured what the events programme cost and nothing about whether any of it
 * worked.
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { CultureHeader } from '../_components/culture-header'
import { PulseClient } from './_components/pulse-client'

export default async function PulsePage() {
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')
  const role = cookieStore.get('hr_preview_role')?.value ?? payload.role

  return (
    <div className="space-y-5">
      <CultureHeader subtitle="Six questions, once a quarter — answered anonymously." />
      <PulseClient isHr={role === 'HR_ADMIN' || role === 'EXECUTIVE'} />
    </div>
  )
}

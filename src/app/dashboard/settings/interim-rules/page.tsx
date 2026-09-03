/**
 * Settings → Interim rules.
 *
 * The shortcuts that exist only because HR is the only person using the
 * system, each with what replaces it and — where there is one — the switch
 * that turns it off. So the day employees start logging in, retiring these is
 * a list to work down rather than an archaeology exercise.
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { allInterimFlags } from '@/lib/interim-flags'
import { InterimRulesClient } from './_components/interim-rules-client'

export default async function InterimRulesPage() {
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')
  const role = cookieStore.get('hr_preview_role')?.value ?? payload.role
  if (role !== 'HR_ADMIN' && role !== 'EXECUTIVE') redirect('/dashboard/settings')

  const flags = await allInterimFlags()

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Interim rules</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          What the app does differently because HR is the only user — and what to switch off
          when that stops being true.
        </p>
      </div>
      <InterimRulesClient initialFlags={flags} canEdit={role === 'HR_ADMIN'} />
    </div>
  )
}

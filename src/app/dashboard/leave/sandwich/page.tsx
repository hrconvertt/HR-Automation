/**
 * Sandwich Deductions.
 *
 * Leave policy section 5: a Friday or Monday absence taken without prior
 * notice costs the weekend beside it too — three unpaid days off pay. That is
 * a different charge from the leave itself, which is one day off a balance, so
 * it is recorded and reviewed here rather than buried in the leave list.
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { SandwichTable } from './_components/sandwich-table'

export default async function SandwichPage() {
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')
  const role = cookieStore.get('hr_preview_role')?.value ?? payload.role
  if (role !== 'HR_ADMIN' && role !== 'EXECUTIVE') redirect('/dashboard/leave')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Sandwich Deductions</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Unpaid days charged under section 5 of the leave policy — a Friday or Monday
          taken without prior notice carries the weekend with it.
        </p>
      </div>
      <SandwichTable />
    </div>
  )
}

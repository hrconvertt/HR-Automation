/**
 * Settings → Data backups.
 *
 * Every two weeks the system saves every data set (leave, work from home,
 * attendance, payroll, …) as CSV files, sorted into folders, and reminds HR
 * to download them. The copies stay here too, so an older fortnight can be
 * downloaded again later.
 *
 * HR and executives only: these files hold every salary and CNIC.
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { DataBackupsClient } from './_components/data-backups-client'

export default async function DataBackupsPage() {
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')
  const role = payload.role === 'HR_ADMIN'
    ? (cookieStore.get('hr_preview_role')?.value ?? payload.role)
    : payload.role
  if (role !== 'HR_ADMIN' && role !== 'EXECUTIVE') redirect('/dashboard/settings')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Data backups</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Every two weeks the system saves all your data as CSV files, sorted into folders, and sends
          you a notification to download them. Making or deleting a backup never changes your live data.
        </p>
      </div>
      <DataBackupsClient canDelete={role === 'HR_ADMIN'} />
    </div>
  )
}

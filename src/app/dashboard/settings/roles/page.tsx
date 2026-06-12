import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import RolesMatrix from '@/components/roles-matrix'

export default async function RolesPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  if (!token) redirect('/login')
  const payload = verifyToken(token)
  if (!payload) redirect('/login')

  if (payload.role !== 'HR_ADMIN') {
    return (
      <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl">
        <h2 className="text-lg font-semibold text-rose-900">Access denied</h2>
        <p className="text-sm text-rose-800 mt-2">HR only.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Role Assignment</h1>
        <p className="text-sm text-gray-500 mt-1">
          Which roles each user holds. Click a cell to toggle. The starred role
          is the user&rsquo;s primary view.
        </p>
      </div>
      <RolesMatrix />
    </div>
  )
}

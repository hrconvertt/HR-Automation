/**
 * Devices â€” HR-only sub-page of the Time & Attendance module.
 * Renders AdminTimeView in 'devices' mode (sync token + device setup).
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import AdminTimeView from '@/app/dashboard/attendance/_views/admin-time-view'

export default async function DevicesPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({ where: { id: payload.userId } })
  if (!user || user.role !== 'HR_ADMIN') redirect('/dashboard/time')

  return (
    <div className="space-y-3">
      <Link href="/dashboard/time" className="inline-flex items-center gap-1 text-sm text-slate-700 hover:underline">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Time & Attendance
      </Link>
      <AdminTimeView mode="devices" />
    </div>
  )
}

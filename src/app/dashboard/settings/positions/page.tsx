import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import PositionsClient from './positions-client'

export default async function PositionsPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  if (!token) redirect('/login')
  const payload = verifyToken(token)
  if (!payload) redirect('/login')

  if (payload.role !== 'HR_ADMIN') {
    return (
      <div className="p-6 bg-slate-50 border border-slate-100 rounded-xl">
        <h2 className="text-lg font-semibold text-slate-900">Access denied</h2>
        <p className="text-sm text-slate-900 mt-2">HR only.</p>
      </div>
    )
  }

  const departments = await prisma.department.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, code: true },
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Positions</h1>
        <p className="text-sm text-gray-500 mt-1">
          The Convertt position ladder. Each position has a level
          (INTERN through C_SUITE) and an optional department. Employees pick
          a position on their profile; designation auto-syncs from the title.
        </p>
      </div>
      <PositionsClient departments={departments} />
    </div>
  )
}

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import SeedClient from './seed-client'

export default async function SeedPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  if (!token) redirect('/login')
  const payload = verifyToken(token)
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({ where: { id: payload.userId } })
  if (!user || user.role !== 'HR_ADMIN') {
    return (
      <div className="p-6 bg-amber-50 border border-amber-200 rounded-2xl">
        <h2 className="text-lg font-semibold text-amber-900">HR-only area</h2>
        <p className="text-sm text-amber-800 mt-2">Only HR Admins can seed demo data.</p>
      </div>
    )
  }

  return <SeedClient />
}

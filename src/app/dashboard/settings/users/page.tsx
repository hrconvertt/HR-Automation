import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import UserManagementClient from './client'

// User Management — HR_ADMIN only. Reads the full user roster (incl. Clerk
// MFA + active state) and renders the management table + invite dialog.
export default async function UserManagementPage() {
  const payload = await verifyToken()
  if (!payload) redirect('/login')
  if (payload.role !== 'HR_ADMIN') redirect('/dashboard')

  const [departments, employees] = await Promise.all([
    prisma.department.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    }),
    prisma.employee.findMany({
      where: { status: { in: ['ACTIVE', 'PROBATION', 'ON_LEAVE'] } },
      select: { id: true, fullName: true, designation: true },
      orderBy: { fullName: 'asc' },
    }),
  ])

  return <UserManagementClient departments={departments} managers={employees} />
}

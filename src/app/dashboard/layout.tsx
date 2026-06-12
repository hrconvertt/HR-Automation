import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import DashboardChrome from '@/components/dashboard-chrome'

// Server wrapper — reads role + identity from cookie BEFORE render so the
// client sidebar never has to wait on a fetch. Eliminates the hydration race
// that was leaving Iqra (and every Manager) with an empty sidebar.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  if (!token) redirect('/login')
  const payload = verifyToken(token)
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      role: true,
      mustChangePass: true,
      isActive: true,
      employee: {
        select: {
          id: true,
          fullName: true,
          designation: true,
          department: { select: { name: true } },
        },
      },
    },
  })

  if (!user || !user.isActive) redirect('/login')

  // Normalise role — if null/unknown, fall back to EMPLOYEE so the user
  // is never stranded with an empty sidebar.
  const knownRoles = new Set(['HR_ADMIN', 'MANAGER', 'EMPLOYEE', 'EXECUTIVE'])
  const role = knownRoles.has(user.role) ? user.role : 'EMPLOYEE'

  const displayName = user.employee?.fullName ?? user.email ?? 'User'
  const designation = user.employee?.designation ?? null
  const departmentName = user.employee?.department?.name ?? null

  return (
    <DashboardChrome
      role={role}
      displayName={displayName}
      email={user.email}
      designation={designation}
      departmentName={departmentName}
      mustChangePass={user.mustChangePass}
    >
      {children}
    </DashboardChrome>
  )
}

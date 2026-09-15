import { cookies } from 'next/headers'
import Link from 'next/link'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const roleLabels: Record<string, string> = {
  HR_ADMIN: 'HR',
  MANAGER: 'Manager',
  LEAD: 'Lead',
  EMPLOYEE: 'Employee',
  EXECUTIVE: 'CEO / Executive',
  FINANCE: 'Finance',
}

/**
 * Recruiting module layout — same flat Workday-style header as People/Payroll.
 * Title + breadcrumb on the left, role chip on the right, no decorative tile.
 */
export default async function RecruitingLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  const payload = await verifyToken(token)

  let effectiveRole = 'EMPLOYEE'
  if (payload) {
    const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { role: true } })
    if (user) {
      const previewRole =
        user.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
      effectiveRole = previewRole ?? user.role
    }
  }

  return (
    // Edge to edge. Recruiting is tables — the requisition workspace carries
    // the sourcing sheet's thirty-odd columns — so it uses the whole screen:
    // these margins cancel the shell's padding, and the shell drops its
    // 1800px cap for this module (see dashboard-chrome).
    <div className="-m-6 lg:-m-8 min-h-full bg-slate-50">
      <div className="bg-white border-b border-slate-200">
        <div className="px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-baseline gap-3 min-w-0">
            <h1 className="text-lg font-semibold text-slate-900 leading-none">Recruiting</h1>
            <nav className="text-xs text-slate-400 truncate">
              <Link href="/dashboard" className="hover:text-slate-600">Dashboard</Link>
              <span className="mx-1.5">/</span>
              <span className="text-slate-500">Recruiting</span>
            </nav>
          </div>
          <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium text-slate-600 bg-slate-100 border border-slate-200">
            {roleLabels[effectiveRole] ?? effectiveRole} view
          </span>
        </div>
      </div>
      <div className="px-4 sm:px-6 py-5">{children}</div>
    </div>
  )
}

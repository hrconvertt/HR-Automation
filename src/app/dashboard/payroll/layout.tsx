import { cookies } from 'next/headers'
import Link from 'next/link'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Banknote } from 'lucide-react'

const roleLabels: Record<string, string> = {
  HR_ADMIN: 'HR',
  MANAGER: 'Manager',
  LEAD: 'Lead',
  EMPLOYEE: 'Employee',
  EXECUTIVE: 'CEO / Executive',
  FINANCE: 'Finance',
}

const roleStyles: Record<string, string> = {
  HR_ADMIN: 'bg-blue-100 text-blue-700 border-blue-200',
  MANAGER: 'bg-purple-100 text-purple-700 border-purple-200',
  LEAD: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  EMPLOYEE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  EXECUTIVE: 'bg-slate-900 text-slate-100 border-slate-700',
  FINANCE: 'bg-rose-100 text-rose-700 border-rose-200',
}

export default async function PayrollLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null

  let effectiveRole = 'EMPLOYEE'
  if (payload) {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { role: true },
    })
    if (user) {
      const previewRole =
        user.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
      effectiveRole = previewRole ?? user.role
    }
  }

  return (
    <div className="-m-4 lg:-m-6 min-h-full bg-slate-50">
      {/* Module Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm">
                <Banknote className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight">
                  Payroll
                </h1>
                <nav className="text-xs text-slate-500 mt-1">
                  <Link href="/dashboard" className="hover:text-slate-700">
                    Dashboard
                  </Link>
                  <span className="mx-1.5">/</span>
                  <span className="text-slate-700 font-medium">Payroll</span>
                </nav>
              </div>
            </div>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border ${
                roleStyles[effectiveRole] ?? roleStyles.EMPLOYEE
              }`}
            >
              Viewing as {roleLabels[effectiveRole] ?? effectiveRole}
            </span>
          </div>
        </div>
      </div>

      {/* Module Body */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">{children}</div>
    </div>
  )
}

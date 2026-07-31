import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { JDBuilder } from './_components/jd-builder'

/**
 * Job description builder — a dedicated screen for entering a JD field by
 * field, rather than the single free-text box on the quick "New Requisition"
 * dialog. Creating requisitions is HR/Manager work, same gate as the
 * requisitions API.
 */
export default async function NewJDPage() {
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')

  const previewRole =
    payload.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? payload.role
  if (!['HR_ADMIN', 'MANAGER'].includes(effectiveRole)) {
    return (
      <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl">
        <h2 className="text-lg font-semibold text-slate-900">Access denied</h2>
        <p className="text-sm text-slate-600 mt-2">Only HR and hiring managers can create requisitions.</p>
        <Link href="/dashboard/recruiting" className="text-sm text-slate-700 underline mt-3 inline-block">
          Back to Recruiting
        </Link>
      </div>
    )
  }

  const departments = await prisma.department.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link
            href="/dashboard/recruiting"
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Recruiting
          </Link>
          <h2 className="text-lg font-semibold text-slate-900 mt-1">New Job Description</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Fill each box. The finished job description assembles on the right as you type.
          </p>
        </div>
      </div>

      <JDBuilder departments={departments} />
    </div>
  )
}

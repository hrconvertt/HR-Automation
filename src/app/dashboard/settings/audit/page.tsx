/**
 * Settings → Audit trail.
 *
 * Sixteen API routes write to AuditLog and, until this page, nothing read it
 * back: 1,515 rows of who-changed-what with no way to look at any of them.
 * The value is not in the volume — most of it is routine attendance marking —
 * it is in the twenty-nine compensation edits and the handful of deletions,
 * which is exactly the evidence wanted when a payslip and the salary sheet
 * disagree and nobody can say why.
 *
 * HR and executives only. This is every salary edit in the company in one
 * list, so it is not something the people it describes should be able to open.
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { AuditClient } from './_components/audit-client'

export default async function AuditPage() {
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
        <h1 className="text-2xl font-bold text-slate-900">Audit trail</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Who changed what, and when. Salary and identity changes are marked — they are
          the ones worth reading.
        </p>
      </div>
      <AuditClient />
    </div>
  )
}

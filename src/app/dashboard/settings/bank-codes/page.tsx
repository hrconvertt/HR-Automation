/**
 * Bank Codes.
 *
 * The list the salary sheet is coded against, and the lookup behind the bank
 * code offered on the employee form. It was a hardcoded map in the codebase
 * until now, so adding a bank meant a deploy.
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { BankCodeTable } from './_components/bank-code-table'

export default async function BankCodesPage() {
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')
  const role = cookieStore.get('hr_preview_role')?.value ?? payload.role
  if (role !== 'HR_ADMIN' && role !== 'EXECUTIVE') redirect('/dashboard/settings')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Bank Codes</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          The banks payroll knows about. Adding one here makes it available on the employee
          form and in the transfer file.
        </p>
      </div>
      <BankCodeTable />
    </div>
  )
}

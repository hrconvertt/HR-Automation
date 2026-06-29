import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import ExitClearanceClient from './_client'

export default async function ExitClearancePage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  if (!token) redirect('/login')
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const previewRole =
    payload.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? payload.role
  if (effectiveRole !== 'HR_ADMIN' && effectiveRole !== 'EXECUTIVE') {
    redirect('/dashboard')
  }

  return <ExitClearanceClient />
}

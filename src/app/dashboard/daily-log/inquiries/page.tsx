import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import InquiriesClient from './inquiries-client'

export default async function InquiriesPage() {
  const payload = await verifyToken()
  if (!payload) redirect('/login')
  if (!payload.employeeId) redirect('/dashboard')
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Inquiries</h1>
        <p className="text-sm text-gray-500 mt-1">
          Respond to questions from your lead about specific tasks or KPIs.
          Resolved inquiries disappear from this page.
        </p>
      </div>
      <InquiriesClient />
    </div>
  )
}

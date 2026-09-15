import Link from 'next/link'

export function NoAccess({ message }: { message: string }) {
  return (
    <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl">
      <h2 className="text-lg font-semibold text-slate-900">Access denied</h2>
      <p className="text-sm text-slate-600 mt-2">{message}</p>
      <Link href="/dashboard/recruiting" className="text-sm text-slate-700 underline mt-3 inline-block">
        Back to Recruiting
      </Link>
    </div>
  )
}

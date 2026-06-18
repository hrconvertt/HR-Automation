import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { guidesForRole } from '@/lib/help/guides'
import { HelpCircle, ChevronRight } from 'lucide-react'

export default async function HelpIndexPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  if (!token) redirect('/login')
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true },
  })
  if (!user) redirect('/login')

  // Help Center is HR-only (actual role, not preview)
  if (user.role !== 'HR_ADMIN') {
    return (
      <div className="p-6 bg-slate-50 border border-slate-100 rounded-2xl">
        <h2 className="text-lg font-semibold text-slate-900">Help Center is HR-only</h2>
        <p className="text-sm text-slate-900 mt-2">
          This in-app guide is maintained by HR. For your own questions, please use the AI chat bubble at the bottom-right, or raise a Help Desk ticket.
        </p>
      </div>
    )
  }

  const previewRole = cookieStore.get('hr_preview_role')?.value
  const effectiveRole = previewRole ?? user.role

  const guides = guidesForRole(effectiveRole)

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-6 text-white shadow-md">
        <div className="flex items-center gap-3">
          <HelpCircle className="w-8 h-8 text-white/90" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Help Center</h1>
            <p className="text-sm text-white/85 mt-1">
              Step-by-step guides for everything in Convertt HR. Tailored to your role: <strong>{effectiveRole.replace('_', ' ')}</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Guide grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {guides.map((g) => {
          const Icon = g.icon
          return (
            <Link
              key={g.slug}
              href={`/dashboard/help/${g.slug}`}
              className="group bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-slate-200 transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-slate-50 text-slate-700 group-hover:bg-slate-100 transition">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 text-base group-hover:text-slate-700">{g.title}</h3>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{g.description}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-slate-700 transition" />
              </div>
            </Link>
          )
        })}
      </div>

      {/* AI chatbot tip */}
      <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">ðŸ’¬</div>
        <div>
          <p className="font-semibold text-gray-900 text-sm">Prefer asking instead of reading?</p>
          <p className="text-sm text-gray-700 mt-0.5">
            Click the floating blue chat bubble at the bottom-right of any screen and ask the AI HR assistant in plain English.
          </p>
        </div>
      </div>
    </div>
  )
}

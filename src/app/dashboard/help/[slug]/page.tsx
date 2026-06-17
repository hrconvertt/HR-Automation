import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { guideBySlug, guidesForRole } from '@/lib/help/guides'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface PageProps { params: Promise<{ slug: string }> }

export default async function GuidePage({ params }: PageProps) {
  const { slug } = await params
  const guide = guideBySlug(slug)
  if (!guide) notFound()

  // Read role for sidebar nav filtering
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  if (!token) redirect('/login')
  const payload = verifyToken(token)
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

  const allGuides = guidesForRole(effectiveRole)
  const Content = guide.Content
  const Icon = guide.icon

  return (
    <div className="space-y-4">
      <Link href="/dashboard/help" className="inline-flex items-center gap-1 text-sm text-slate-700 hover:underline">
        <ArrowLeft className="w-4 h-4" /> Back to Help Center
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
        {/* Sidebar nav with all guides */}
        <aside className="lg:sticky lg:top-4 self-start">
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold px-2 mb-2">All Guides</p>
            <nav className="space-y-0.5">
              {allGuides.map((g) => {
                const GIcon = g.icon
                const active = g.slug === slug
                return (
                  <Link
                    key={g.slug}
                    href={`/dashboard/help/${g.slug}`}
                    className={`
                      flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition
                      ${active
                        ? 'bg-slate-50 text-slate-700 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'}
                    `}
                  >
                    <GIcon className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1 truncate">{g.title}</span>
                    {active && <ChevronRight className="w-3.5 h-3.5" />}
                  </Link>
                )
              })}
            </nav>
          </div>
        </aside>

        {/* Content */}
        <article className="bg-white border border-gray-200 rounded-xl p-6 lg:p-8 max-w-3xl">
          <div className="flex items-center gap-3 pb-4 border-b border-gray-100 mb-2">
            <div className="p-2 rounded-lg bg-slate-50 text-slate-700">
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{guide.title}</h1>
              <p className="text-sm text-gray-500 mt-0.5">{guide.description}</p>
            </div>
          </div>

          <Content />
        </article>
      </div>
    </div>
  )
}

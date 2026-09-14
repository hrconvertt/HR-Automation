/** Help Center → Edit article. HR only. */
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { talentViewer } from '@/lib/talent'
import { ArticleEditor } from '../_components/article-editor'

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await talentViewer()
  if (!viewer) redirect('/login')
  if (viewer.actualRole !== 'HR_ADMIN' || viewer.isPreviewMode) redirect('/dashboard/help')
  const { id } = await params
  const a = await prisma.helpArticle.findUnique({ where: { id } })
  if (!a) notFound()
  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <Link href="/dashboard/help/manage" className="text-sm text-slate-600 underline underline-offset-2">← Manage articles</Link>
      <h1 className="text-2xl font-bold text-slate-900">Edit article</h1>
      <ArticleEditor initial={{
        id: a.id, title: a.title, category: a.category, summary: a.summary ?? '', body: a.body,
        tags: a.tags, audienceRoles: a.audienceRoles, status: a.status,
      }} />
    </div>
  )
}

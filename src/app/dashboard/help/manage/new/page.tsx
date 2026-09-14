/** Help Center → New article. HR only. */
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { talentViewer } from '@/lib/talent'
import { ArticleEditor } from '../_components/article-editor'

export default async function NewArticlePage() {
  const viewer = await talentViewer()
  if (!viewer) redirect('/login')
  if (viewer.actualRole !== 'HR_ADMIN' || viewer.isPreviewMode) redirect('/dashboard/help')
  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <Link href="/dashboard/help/manage" className="text-sm text-slate-600 underline underline-offset-2">← Manage articles</Link>
      <h1 className="text-2xl font-bold text-slate-900">New article</h1>
      <ArticleEditor />
    </div>
  )
}

/**
 * An in-app guide, read like any Help Center article: the category, the
 * guide, then related answers, "Was this helpful?" and Create Case. Open to
 * every role — each guide already says which roles it is for.
 */
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { guideBySlug } from '@/lib/help/guides'
import { talentViewer } from '@/lib/talent'
import { knowledgeFor, relatedTo } from '@/lib/help-center-server'
import { ArticleFooter } from '@/components/help/article-footer'

interface PageProps { params: Promise<{ slug: string }> }

export default async function GuidePage({ params }: PageProps) {
  const { slug } = await params
  const guide = guideBySlug(slug)
  if (!guide) notFound()
  const viewer = await talentViewer()
  if (!viewer) redirect('/login')
  if (viewer.effectiveRole !== 'HR_ADMIN' && !guide.roles.includes(viewer.effectiveRole as (typeof guide.roles)[number])) notFound()

  const [entries, vote] = await Promise.all([
    knowledgeFor(viewer.effectiveRole),
    viewer.employeeId
      ? prisma.articleFeedback.findUnique({
          where: { refType_refId_employeeId: { refType: 'GUIDE', refId: slug, employeeId: viewer.employeeId } },
          select: { helpful: true },
        })
      : null,
  ])
  const tags = ['how to', slug.replace(/-/g, ' ')]
  const Content = guide.Content

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <Link href="/dashboard/help?cat=USING_THE_APP" className="text-sm text-slate-600 underline underline-offset-2">← Help Center</Link>
      <article className="bg-white border border-slate-200 rounded-2xl p-6 lg:p-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Using Convertt HR</p>
        <h1 className="text-3xl font-bold text-slate-900 mt-1">{guide.title}</h1>
        <p className="text-base text-slate-600 mt-2">{guide.description.replace(/&amp;/g, '&')}</p>
        <div className="border-t border-slate-100 mt-5 pt-2">
          <Content />
        </div>
        <ArticleFooter
          tags={tags}
          related={relatedTo(entries, { kind: 'GUIDE', id: slug, category: 'USING_THE_APP', tags })}
          refType="GUIDE"
          refId={slug}
          myVote={vote?.helpful ?? null}
          caseType="GENERAL"
          caseTitle={guide.title}
        />
      </article>
    </div>
  )
}

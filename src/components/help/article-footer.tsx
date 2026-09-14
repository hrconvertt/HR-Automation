/**
 * The end of every Help Center reading page — articles, policies and guides
 * alike, as Workday ends one: tags, related articles, "Was this article
 * helpful?", and "Still need help? Create a case".
 */
import Link from 'next/link'
import type { KnowledgeEntry } from '@/lib/help-center-server'
import type { FeedbackRef } from '@/lib/help-center'
import { HelpfulWidget } from './helpful-widget'

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

export function ArticleFooter({ tags, related, refType, refId, myVote, caseType, caseTitle }: {
  tags: string[]
  related: KnowledgeEntry[]
  refType: FeedbackRef
  refId: string
  myVote: boolean | null
  /** Preselects the case type on Create Case. */
  caseType?: string
  caseTitle?: string
}) {
  const params = new URLSearchParams()
  if (caseType) params.set('type', caseType)
  if (caseTitle) params.set('about', caseTitle)
  const createHref = `/dashboard/help/cases/new${params.toString() ? `?${params}` : ''}`

  return (
    <div className="space-y-6 mt-8 print:hidden">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <Link key={t} href={`/dashboard/help?q=${encodeURIComponent(t)}`}
              className="text-xs px-2.5 py-1 rounded bg-slate-100 text-slate-700 hover:bg-slate-200">
              {t}
            </Link>
          ))}
        </div>
      )}

      {related.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Related articles</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {related.map((r) => (
              <Link key={`${r.kind}:${r.id}`} href={r.href}
                className="group border border-slate-200 rounded-xl p-4 hover:shadow-sm bg-white flex flex-col">
                <p className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">{r.categoryLabel}</p>
                <p className="text-sm font-semibold text-blue-700 group-hover:underline mt-1">{r.title}</p>
                <p className="text-xs text-slate-600 mt-1.5 line-clamp-4 flex-1">{r.summary}</p>
                {r.updatedAt && <p className="text-[11px] text-slate-400 mt-3">Last updated {day(r.updatedAt)}</p>}
              </Link>
            ))}
          </div>
        </section>
      )}

      <HelpfulWidget refType={refType} refId={refId} initial={myVote} />

      <div className="border border-slate-200 rounded-xl px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">Still need help?</p>
          <p className="text-base font-semibold text-slate-900">Create a case to get support from a specialist.</p>
        </div>
        <Link href={createHref} className="text-sm font-semibold px-5 py-2 rounded-full bg-blue-700 text-white hover:bg-blue-800">
          Create case
        </Link>
      </div>
    </div>
  )
}

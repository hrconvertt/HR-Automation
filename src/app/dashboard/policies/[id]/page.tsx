import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ArrowLeft, ExternalLink, Calendar, Users, FileText } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { renderMarkdown } from '@/lib/markdown'
import { PrintButton } from '@/components/policies/print-button'

/**
 * Policy reader page — Notion / Stripe Docs style:
 *   • Slim breadcrumb header with status pill
 *   • Two-column body on desktop (content + a quiet metadata sidebar)
 *   • Larger reading typography, comfortable line-height
 *   • Print button (browser-native — no extra deps)
 */
export default async function PolicyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  if (!token) redirect('/login')
  const payload = verifyToken(token)
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, employee: { select: { id: true } } },
  })
  if (!user) redirect('/login')

  const policy = await prisma.policyDocument.findUnique({ where: { id } })
  if (!policy) notFound()

  const isHR = user.role === 'HR_ADMIN'
  // Non-HR users only see PUBLISHED policies in their audience
  if (!isHR) {
    if (policy.status !== 'PUBLISHED') notFound()
    if (policy.audience === 'HR_ONLY') notFound()
    if (policy.audience === 'MANAGERS' && user.role !== 'MANAGER') notFound()
  }

  const audienceLabel: Record<string, string> = {
    ALL: 'All employees',
    MANAGERS: 'Managers only',
    HR_ONLY: 'HR only',
  }
  const categoryLabel: Record<string, string> = {
    LEAVE: 'Leave',
    CODE_OF_CONDUCT: 'Code of Conduct',
    IT: 'IT',
    SECURITY: 'Security',
    COMPENSATION: 'Compensation',
    GENERAL: 'General',
  }

  return (
    <div className="policy-print-root max-w-6xl mx-auto">
      {/* Slim breadcrumb row */}
      <div className="flex items-center justify-between gap-3 mb-5 print:hidden">
        <Link href="/dashboard/policies" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition">
          <ArrowLeft className="w-4 h-4" />
          <span>Policies</span>
        </Link>
        <PrintButton />
      </div>

      {/* Hero — quiet, no decorative gradient. Title + status + a single
          fact line. Everything secondary goes in the sidebar. */}
      <header className="border-b border-slate-200 pb-5 mb-8">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
          <FileText className="w-3.5 h-3.5" />
          <span>{categoryLabel[policy.category] ?? policy.category}</span>
          <span className="text-slate-300">·</span>
          <span>v{policy.version}</span>
          {policy.status !== 'PUBLISHED' && (
            <>
              <span className="text-slate-300">·</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${policy.status === 'ARCHIVED' ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-800'}`}>
                {policy.status}
              </span>
            </>
          )}
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight tracking-tight">
          {policy.title}
        </h1>
        {policy.description && (
          <p className="text-base text-slate-600 mt-3 leading-relaxed max-w-2xl">{policy.description}</p>
        )}
      </header>

      {/* Two-column body: content left, sidebar right. Stacks on mobile. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-10 items-start">
        {/* Reader pane */}
        <article className="min-w-0">
          {policy.content ? (
            <div
              className="prose prose-slate prose-headings:font-semibold prose-headings:tracking-tight prose-h2:mt-8 prose-h2:mb-3 prose-h3:mt-6 prose-h3:mb-2 prose-p:leading-relaxed prose-li:my-1 max-w-none"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(policy.content) }}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
              <p className="text-sm text-slate-500">
                No in-app content for this policy.
                {policy.url ? ' See the attached document below.' : ''}
              </p>
            </div>
          )}

          {policy.url && (
            <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">Attached document</p>
                  <p className="text-xs text-slate-500 truncate">{policy.url}</p>
                </div>
              </div>
              <a
                href={policy.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 flex-shrink-0"
              >
                Open <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </article>

        {/* Metadata sidebar — quiet, no card chrome. Hidden in print. */}
        <aside className="print:hidden lg:sticky lg:top-6 space-y-5">
          {policy.status === 'PUBLISHED' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Published
            </span>
          )}
          <MetaRow Icon={Calendar} label="Effective" value={policy.effectiveDate ? formatDate(policy.effectiveDate) : '—'} />
          <MetaRow Icon={Calendar} label="Published" value={policy.publishedAt ? formatDate(policy.publishedAt) : '—'} />
          <MetaRow Icon={Users} label="Audience" value={audienceLabel[policy.audience] ?? policy.audience} />
          <MetaRow Icon={FileText} label="Version" value={`v${policy.version}`} />
        </aside>
      </div>

      {/*
        Print-only isolation. The dashboard layout wraps this page in a
        sidebar + topbar + focus banner + role switcher + chatbot, none of
        which belong on a saved PDF. We hide the entire tree by default
        and only re-show the policy-print-root subtree, then reset its
        positioning so it fills the page from the top-left.
      */}
      <style>{`
        @media print {
          @page { margin: 18mm 16mm; }
          html, body { background: white !important; height: auto !important; overflow: visible !important; }
          /* Hide everything by default */
          body * { visibility: hidden !important; }
          /* Re-show the policy subtree */
          .policy-print-root, .policy-print-root * { visibility: visible !important; }
          /* Float the subtree to fill the page cleanly */
          .policy-print-root {
            position: absolute !important;
            left: 0; top: 0; right: 0;
            margin: 0 !important;
            padding: 0 !important;
            max-width: 100% !important;
            color: #000 !important;
          }
          /* Hide every \`print:hidden\` element explicitly (Tailwind utility
             targets media-print already, but we double-down for safety) */
          .print\\:hidden { display: none !important; }
          aside { display: none !important; }
          /* Allow long content to break across pages cleanly */
          article, article * { page-break-inside: avoid-page; }
          h1, h2, h3 { page-break-after: avoid; }
        }
      `}</style>
    </div>
  )
}

function MetaRow({ Icon, label, value }: {
  Icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{label}</p>
        <p className="text-sm text-slate-900 mt-0.5 truncate">{value}</p>
      </div>
    </div>
  )
}

// PrintButton lives in @/components/policies/print-button.tsx (client component).

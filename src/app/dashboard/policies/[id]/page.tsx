import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseAudienceRoles } from '@/lib/policy-access'
import { ArrowLeft, ExternalLink, Calendar, Users, FileText } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { renderMarkdown } from '@/lib/markdown'
import { PrintButton } from '@/components/policies/print-button'
import { PolicyApprovalActions } from '@/components/policy-approval-actions'

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
  const payload = await verifyToken(token)
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, employee: { select: { id: true } } },
  })
  if (!user) redirect('/login')

  const policy = await prisma.policyDocument.findUnique({
    where: { id },
    include: {
      reviews: {
        include: { reviewer: { select: { id: true, fullName: true, designation: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!policy) notFound()

  const isHR = user.role === 'HR_ADMIN'
  // Non-HR users only see ACTIVE / PUBLISHED policies in their audience.
  // (Executives assigned as reviewers see IN_REVIEW too — see assignment lookup below.)
  const isReviewer = !!user.employee && policy.reviewerIds.includes(user.employee.id)
  let unauthorized = false
  if (!isHR) {
    const visibleStatuses = isReviewer
      ? ['ACTIVE', 'PUBLISHED', 'IN_REVIEW', 'APPROVED']
      : ['ACTIVE', 'PUBLISHED']
    if (!visibleStatuses.includes(policy.status)) notFound()
    if (policy.audience === 'HR_ONLY' && !isReviewer) notFound()
    if (policy.audience === 'MANAGERS' && user.role !== 'MANAGER' && !isReviewer) notFound()
    // ── Per-role audience check.
    const audienceRoles = parseAudienceRoles(policy.audienceRoles)
    if (!audienceRoles.includes(user.role) && !isReviewer) {
      unauthorized = true
    }
  }

  if (unauthorized) {
    return (
      <div className="max-w-xl mx-auto mt-20 text-center px-4">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-slate-50 text-slate-700 mb-4">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-slate-900 mb-1">Not authorized for this policy</h1>
        <p className="text-sm text-slate-500 mb-6">
          This policy exists but isn&apos;t shared with your role. If you believe this is a mistake, please reach out to HR.
        </p>
        <Link href="/dashboard/policies" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-slate-700">
          <ArrowLeft className="w-4 h-4" /> Back to Policies
        </Link>
      </div>
    )
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
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${policy.status === 'ARCHIVED' ? 'bg-slate-100 text-slate-600' : 'bg-slate-100 text-slate-900'}`}>
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
                <div className="w-9 h-9 rounded-lg bg-slate-50 text-slate-700 flex items-center justify-center flex-shrink-0">
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
                className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-slate-700 flex-shrink-0"
              >
                Open <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </article>

        {/* Metadata sidebar — quiet, no card chrome. Hidden in print. */}
        <aside className="print:hidden lg:sticky lg:top-6 space-y-5">
          <PolicyStatusPill status={policy.status} />

          {/* Workflow panel — Send for Review (HR draft), Approve/Reject (assigned
              reviewer), Activate (HR once APPROVED). Only renders relevant buttons. */}
          <PolicyApprovalActions
            policyId={policy.id}
            policyTitle={policy.title}
            status={policy.status}
            isHR={isHR}
            isReviewer={isReviewer}
            myReview={
              user.employee
                ? policy.reviews.find((r) => r.reviewerId === user.employee!.id) ?? null
                : null
            }
          />

          {/* Review timeline */}
          {(policy.status === 'IN_REVIEW' || policy.status === 'APPROVED' || policy.reviews.length > 0) && (
            <div>
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-2">Reviewers</p>
              <ul className="space-y-2">
                {policy.reviews.map((r) => (
                  <li key={r.id} className="flex items-start gap-2 text-xs">
                    <span
                      className={`mt-0.5 inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                        r.status === 'APPROVED' ? 'bg-slate-500' :
                        r.status === 'REJECTED' ? 'bg-slate-500' : 'bg-slate-300'
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="text-slate-900 font-medium truncate">{r.reviewer.fullName}</p>
                      <p className="text-slate-500 truncate">
                        {r.status === 'APPROVED' ? 'Approved' : r.status === 'REJECTED' ? 'Rejected' : 'Pending'}
                        {r.comment ? ` · ${r.comment}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
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

function PolicyStatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; dot: string }> = {
    ACTIVE:    { label: 'Active',                 cls: 'bg-slate-50 text-slate-700 border-slate-100', dot: 'bg-slate-500' },
    PUBLISHED: { label: 'Active',                 cls: 'bg-slate-50 text-slate-700 border-slate-100', dot: 'bg-slate-500' },
    DRAFT:     { label: 'Draft',                  cls: 'bg-slate-100 text-slate-700 border-slate-200',     dot: 'bg-slate-400' },
    IN_REVIEW: { label: 'In Review',              cls: 'bg-slate-50 text-slate-700 border-slate-100',      dot: 'bg-slate-500' },
    APPROVED:  { label: 'Approved · Awaiting HR', cls: 'bg-slate-50 text-slate-700 border-slate-100',         dot: 'bg-slate-500' },
    ARCHIVED:  { label: 'Archived',               cls: 'bg-slate-100 text-slate-600 border-slate-200',     dot: 'bg-slate-400' },
  }
  const s = map[status] ?? map.DRAFT
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  )
}

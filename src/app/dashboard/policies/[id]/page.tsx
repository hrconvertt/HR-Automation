import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseAudienceRoles } from '@/lib/policy-access'
import { ArrowLeft } from 'lucide-react'
import { LOGO_DATA_URI } from '@/lib/brand-logo'
import { PrintButton } from '@/components/policies/print-button'
import { PolicyApprovalActions } from '@/components/policy-approval-actions'
import { PolicyDocument } from '@/components/policies/policy-document'
import { knowledgeFor, relatedTo } from '@/lib/help-center-server'
import { ArticleFooter } from '@/components/help/article-footer'

/**
 * The browser puts the page title in the Save-as-PDF filename box, so the
 * policy's name is the title — a saved policy arrives named after itself.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const policy = await prisma.policyDocument.findUnique({ where: { id }, select: { title: true } })
  return { title: policy ? policy.title.replace(/[\\/:*?"<>|]/g, '').trim() : 'Policy' }
}

const CATEGORY_TAG: Record<string, string> = {
  LEAVE: 'leave',
  CODE_OF_CONDUCT: 'code of conduct',
  IT: 'it',
  SECURITY: 'security',
  COMPENSATION: 'compensation',
  GENERAL: 'general',
}

/**
 * A policy on its own page, drawn as the official document (letterhead,
 * document control, numbered clauses) with the real mark. The approval
 * workflow sits in a bar above it; below it, the Help Center footer — tags,
 * related articles, "Was this article helpful?" and "Create a case". Neither
 * prints.
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

  const showWorkflow = isHR || isReviewer || policy.reviews.length > 0
  const myReview = user.employee
    ? policy.reviews.find((r) => r.reviewerId === user.employee!.id) ?? null
    : null

  // The Help Center footer: related answers, and this reader's own
  // "was it helpful" vote. Live policies only.
  const live = policy.status === 'ACTIVE' || policy.status === 'PUBLISHED'
  const tags = ['policy', CATEGORY_TAG[policy.category] ?? policy.category.toLowerCase()]
  const [entries, vote] = live
    ? await Promise.all([
        knowledgeFor(user.role),
        user.employee
          ? prisma.articleFeedback.findUnique({
              where: { refType_refId_employeeId: { refType: 'POLICY', refId: policy.id, employeeId: user.employee.id } },
              select: { helpful: true },
            })
          : null,
      ])
    : [[], null]

  return (
    <div className="policy-print-root mx-auto max-w-5xl">
      {/* Top bar */}
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3 text-sm">
          <Link
            href={`/dashboard/policies?policy=${policy.id}`}
            className="inline-flex items-center gap-1.5 font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Policies
          </Link>
          <span className="text-slate-300">·</span>
          <Link href="/dashboard/help?cat=POLICIES" className="text-slate-500 underline underline-offset-2 hover:text-slate-900">
            Help Center
          </Link>
        </div>
        <PrintButton />
      </div>

      {/* Approval workflow — only the buttons that apply to this viewer, and
          who has reviewed. Never printed. */}
      {showWorkflow && (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 print:hidden">
          {policy.reviews.length > 0 ? (
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Reviewers</p>
              <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                {policy.reviews.map((r) => (
                  <li key={r.id} className="text-slate-800">
                    <span className="font-medium">{r.reviewer.fullName}</span>
                    <span className="text-slate-500">
                      {' — '}
                      {r.status === 'APPROVED' ? 'Approved' : r.status === 'REJECTED' ? 'Rejected' : 'Pending'}
                      {r.comment ? ` · ${r.comment}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No reviewers assigned yet.</p>
          )}
          <PolicyApprovalActions
            policyId={policy.id}
            policyTitle={policy.title}
            status={policy.status}
            isHR={isHR}
            isReviewer={isReviewer}
            myReview={myReview}
          />
        </div>
      )}

      <div className="rounded-xl bg-slate-100 p-4 sm:p-8 print:bg-white print:p-0">
        <PolicyDocument policy={policy} logoSrc={LOGO_DATA_URI} />
      </div>

      {live && (
        <div className="mx-auto max-w-[820px]">
          <ArticleFooter
            tags={tags}
            related={relatedTo(entries, { kind: 'POLICY', id: policy.id, category: 'POLICIES', tags })}
            refType="POLICY"
            refId={policy.id}
            myVote={vote?.helpful ?? null}
            caseType="POLICY"
            caseTitle={policy.title}
          />
        </div>
      )}

      {/*
        Print-only isolation. The dashboard layout wraps this page in a
        sidebar + topbar + role switcher + chatbot, none of which belong on a
        saved PDF. Hide the whole tree and re-show only the policy subtree.
      */}
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm 12mm; }
          html, body { background: white !important; height: auto !important; overflow: visible !important; }
          body * { visibility: hidden !important; }
          .policy-print-root, .policy-print-root * { visibility: visible !important; }
          .policy-print-root {
            position: absolute !important;
            left: 0; top: 0; right: 0;
            margin: 0 !important;
            padding: 0 !important;
            max-width: 100% !important;
            color: #000 !important;
          }
          .print\\:hidden { display: none !important; }
          h1, h2, h3 { page-break-after: avoid; }
          tr, dl > div { page-break-inside: avoid; }
        }
      `}</style>
    </div>
  )
}

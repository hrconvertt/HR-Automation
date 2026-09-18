/**
 * A policy drawn as the company's official document: letterhead, document
 * code and classification, the title, a document-control panel, then the
 * numbered clauses. The same component draws the reading pane of the policy
 * library and the full policy page, so a policy looks the same wherever it is
 * opened and prints as it reads.
 *
 * No hooks and no data access, so it renders on the server (the full page,
 * with the real logo) and inside the client library (text wordmark — the logo
 * is a large inline image and does not belong in a client bundle).
 */

import { renderMarkdown } from '@/lib/markdown'
import { formatDate } from '@/lib/utils'
import { BRAND_CHARCOAL } from '@/lib/brand'

export type PolicyDocumentData = {
  title: string
  category: string
  status: string
  version: string
  effectiveDate: string | Date | null
  content: string | null
  url: string | null
}

const CATEGORY_LABEL: Record<string, string> = {
  CODE_OF_CONDUCT: 'Code of Conduct',
  SECURITY: 'Confidentiality & Security',
  IT: 'IT',
  COMPENSATION: 'Compensation',
  LEAVE: 'Leave',
  GENERAL: 'General',
}

/** Only states other than "live" are called out on the document. */
const STATUS_NOTE: Record<string, string> = {
  DRAFT: 'Draft — not visible to employees',
  IN_REVIEW: 'In review — not yet approved',
  APPROVED: 'Approved — not yet live',
  ARCHIVED: 'Archived — no longer in force',
}

/**
 * The Playbook imports open every policy with a two-column "Policy detail" (or
 * "Document detail") table. On the official document those rows belong in
 * the document-control panel, not as the first thing in the body, so they are
 * lifted out. A policy without that table keeps its body untouched.
 */
export function splitDocumentControl(content: string): { rows: [string, string][]; body: string } {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  let i = 0
  while (i < lines.length && !lines[i].trim()) i++
  if (!/^\|\s*(Policy|Document) detail\s*\|/i.test(lines[i] ?? '')) return { rows: [], body: content }
  i += 2 // header row + separator
  const rows: [string, string][] = []
  while (i < lines.length && /^\|.+\|\s*$/.test(lines[i])) {
    const cells = lines[i].split('|').slice(1, -1).map((c) => c.trim())
    if (cells[0]) rows.push([cells[0], cells[1] ?? ''])
    i++
  }
  return { rows, body: lines.slice(i).join('\n') }
}

function kindOf(code: string | undefined): string {
  if (code?.startsWith('CVT-SOP')) return 'HR Procedure'
  if (code?.startsWith('CVT-ANX')) return 'Country Employment Terms'
  return 'HR Policy'
}

export function PolicyDocument({ policy, logoSrc }: { policy: PolicyDocumentData; logoSrc?: string }) {
  const { rows, body } = splitDocumentControl(policy.content ?? '')
  const code = rows.find(([k]) => /\bID$/.test(k))?.[1]
  const controlRows: [string, string][] = rows.length
    ? rows.filter(([k]) => !/\bID$/.test(k))
    : [
        ['Category', CATEGORY_LABEL[policy.category] ?? policy.category.replace(/_/g, ' ')],
        ['Version', policy.version],
        ['Effective date', policy.effectiveDate ? formatDate(policy.effectiveDate) : 'Not set'],
      ]
  const note = STATUS_NOTE[policy.status]

  return (
    <article className="mx-auto w-full max-w-[820px] bg-white text-[#1A1A1A] shadow-sm ring-1 ring-slate-200 print:max-w-none print:shadow-none print:ring-0">
      {/* Letterhead */}
      <header
        className="flex items-start justify-between gap-6 border-b-2 px-6 pb-5 pt-8 sm:px-10"
        style={{ borderColor: BRAND_CHARCOAL }}
      >
        <div>
          {/* The real mark on every view — the library and builder previews
              use the hosted copy so the client bundle stays small. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc ?? '/brand/convertt-logo.png'} alt="Convertt" className="block h-9 w-auto" />
          <p className="mt-2 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            {kindOf(code)}
          </p>
        </div>
        <div className="text-right text-[11px] leading-relaxed text-slate-600">
          <p className="font-mono text-[12px] font-semibold" style={{ color: BRAND_CHARCOAL }}>
            {code ? `${code} · v${policy.version}` : `Version ${policy.version}`}
          </p>
          <p>Private &amp; Confidential</p>
          <p>Internal use only</p>
        </div>
      </header>

      <div className="px-6 pb-12 pt-8 sm:px-10">
        <h1
          className="text-center text-[21px] font-bold uppercase leading-snug tracking-[0.06em]"
          style={{ color: BRAND_CHARCOAL }}
        >
          {policy.title}
        </h1>
        {note && (
          <p className="mx-auto mt-3 w-fit border border-slate-400 px-2.5 py-1 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700">
            {note}
          </p>
        )}

        {/* Document control */}
        <section className="mt-7 border border-slate-300">
          <p className="border-b border-slate-300 bg-slate-50 px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Document control
          </p>
          <dl className="grid grid-cols-1 text-[13px] sm:grid-cols-[170px_minmax(0,1fr)]">
            {controlRows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="border-b border-slate-200 px-4 pb-0 pt-2 font-semibold text-slate-600 sm:py-2">{k}</dt>
                <dd className="border-b border-slate-200 px-4 pb-2 pt-0.5 text-slate-900 sm:py-2">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* The clauses. Headings are set as formal section titles over a rule,
            tables are fully ruled, as on the printed Playbook. */}
        {body.trim() ? (
          <div
            className="mt-8 text-[13.5px] leading-relaxed
              [&_h1]:mt-8 [&_h1]:text-[15px] [&_h1]:uppercase [&_h1]:tracking-[0.08em]
              [&_h2]:mt-9 [&_h2]:border-b [&_h2]:border-slate-300 [&_h2]:pb-1.5 [&_h2]:text-[13.5px] [&_h2]:font-bold [&_h2]:uppercase [&_h2]:tracking-[0.1em] [&_h2]:text-[#16171A]
              [&_h3]:mt-5 [&_h3]:text-[13.5px] [&_h3]:font-bold [&_h3]:text-[#16171A]
              [&_p]:text-[13.5px] [&_p]:text-[#1A1A1A] [&_li]:text-[13.5px] [&_li]:text-[#1A1A1A]
              [&_table]:border [&_table]:border-slate-300
              [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-50 [&_th]:text-[12px] [&_th]:uppercase [&_th]:tracking-wide
              [&_td]:border [&_td]:border-slate-200 [&_td]:align-top [&_td]:text-[12.5px] [&_td]:text-[#1A1A1A]
              [&_blockquote]:not-italic [&_hr]:my-6"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }}
          />
        ) : (
          <p className="mt-8 border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
            This policy has no in-app text{policy.url ? ' — see the attached document below.' : '.'}
          </p>
        )}

        {policy.url && (
          <p className="mt-8 border-t border-slate-200 pt-4 text-[13px]">
            <span className="font-semibold">Attached document: </span>
            <a href={policy.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
              Open the attachment
            </a>
          </p>
        )}
      </div>
    </article>
  )
}

'use client'

/**
 * The one way a list of policies is drawn — Policies (HR) and the Document
 * Center both use it.
 *
 * Every row says in words what it does. The name is a link, and beside it
 * sits an "Open policy" button that goes to the same reader page, so there is
 * never a question of what is clickable or where it leads. HR's extra actions
 * are labelled buttons too, not bare icons. Policies are grouped under their
 * category so a list of thirty reads as a handful of short sections.
 */

import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'

export type PolicyListItem = {
  id: string
  title: string
  category: string
  description: string | null
  status: string
  version: string
  effectiveDate: string | null
}

export const CATEGORY_ORDER = ['CODE_OF_CONDUCT', 'SECURITY', 'IT', 'COMPENSATION', 'LEAVE', 'GENERAL']

export const CATEGORY_LABEL: Record<string, string> = {
  CODE_OF_CONDUCT: 'Code of Conduct',
  SECURITY: 'Confidentiality & Security',
  IT: 'IT',
  COMPENSATION: 'Compensation',
  LEAVE: 'Leave',
  GENERAL: 'General',
}

/** Only states that need attention get a tag; a live policy is the normal case. */
const STATUS_TAG: Record<string, string> = {
  DRAFT: 'Draft — not visible to employees',
  IN_REVIEW: 'In review',
  APPROVED: 'Approved — not live yet',
  ARCHIVED: 'Archived',
}

/**
 * The June 2026 imports captured the letterhead as their description
 * ("▌CONVERTT · Convertt Ltd …"). That is not a summary; show nothing instead.
 */
function summary(description: string | null): string | null {
  if (!description || description.startsWith('▌')) return null
  return description
}

export function PolicyList({
  policies,
  onEdit,
  onArchive,
  emptyText = 'No policies match.',
}: {
  policies: PolicyListItem[]
  onEdit?: (id: string) => void
  onArchive?: (id: string) => void
  emptyText?: string
}) {
  if (policies.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
        {emptyText}
      </div>
    )
  }

  const known = CATEGORY_ORDER.filter((c) => policies.some((p) => p.category === c))
  const other = [...new Set(policies.map((p) => p.category))].filter((c) => !CATEGORY_ORDER.includes(c))
  const groups = [...known, ...other].map((category) => ({
    category,
    items: policies
      .filter((p) => p.category === category)
      .sort((a, b) => a.title.localeCompare(b.title)),
  }))

  return (
    <div className="space-y-6">
      {groups.map(({ category, items }) => (
        <section key={category}>
          <h2 className="mb-2 flex items-baseline gap-2 px-1 text-sm font-semibold text-slate-900">
            {CATEGORY_LABEL[category] ?? category.replace(/_/g, ' ')}
            <span className="text-xs font-normal text-slate-500">
              {items.length} {items.length === 1 ? 'policy' : 'policies'}
            </span>
          </h2>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {items.map((p) => {
              const tag = STATUS_TAG[p.status]
              const text = summary(p.description)
              const href = `/dashboard/policies/${p.id}`
              return (
                <li key={p.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-6">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={href}
                        className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900"
                      >
                        {p.title}
                      </Link>
                      {tag && (
                        <span className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                          {tag}
                        </span>
                      )}
                    </div>
                    {text && <p className="mt-1 line-clamp-1 text-sm text-slate-500">{text}</p>}
                    <p className="mt-1 text-xs text-slate-400">
                      {p.effectiveDate ? `Effective ${formatDate(p.effectiveDate)}` : 'No effective date'}
                      {' · '}Version {p.version}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link href={href} className={buttonVariants({ size: 'sm' })}>
                      Open policy
                    </Link>
                    {onEdit && (
                      <Button size="sm" variant="outline" onClick={() => onEdit(p.id)}>
                        Edit details
                      </Button>
                    )}
                    {onArchive && p.status !== 'ARCHIVED' && (
                      <Button size="sm" variant="ghost" onClick={() => onArchive(p.id)}>
                        Archive
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

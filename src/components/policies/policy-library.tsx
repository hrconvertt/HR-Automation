'use client'

/**
 * The policy library: categories on the left, the policies in that category
 * in the middle, and the selected policy open on the right as the official
 * document — all on one screen, so reading a policy never means leaving the
 * list. Policies, the Document Center and the employee library all use it.
 *
 * The open policy is kept in ?policy=<id>, so a link to a policy can be sent.
 * On small screens there is no room for three panes: choosing a policy opens
 * its full page instead.
 *
 * Callers must wrap this in <Suspense> — it reads useSearchParams, and a
 * prerendered page that does so without a boundary fails the build.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { PolicyDocument, type PolicyDocumentData } from '@/components/policies/policy-document'

export type LibraryPolicy = PolicyDocumentData & { id: string; description: string | null }

const CATEGORY_ORDER = ['CODE_OF_CONDUCT', 'SECURITY', 'IT', 'COMPENSATION', 'LEAVE', 'GENERAL']

const CATEGORY_LABEL: Record<string, string> = {
  ALL: 'All policies',
  ARCHIVED: 'Archived',
  CODE_OF_CONDUCT: 'Code of Conduct',
  SECURITY: 'Confidentiality & Security',
  IT: 'IT',
  COMPENSATION: 'Compensation',
  LEAVE: 'Leave',
  GENERAL: 'General',
}

/** Shown under a title only when the policy is not live. */
const NOT_LIVE: Record<string, string> = {
  DRAFT: 'Draft',
  IN_REVIEW: 'In review',
  APPROVED: 'Approved, not live yet',
  ARCHIVED: 'Archived',
}

export function PolicyLibrary({
  policies,
  loading = false,
  onEdit,
  onArchive,
  onRestore,
  onDeletePermanently,
  railFooter,
  emptyText = 'No policies yet.',
}: {
  policies: LibraryPolicy[]
  loading?: boolean
  /** HR only: opens the edit form for a policy. */
  onEdit?: (id: string) => void
  /** HR only: archives a policy. */
  onArchive?: (id: string) => void
  /** HR only: puts an archived policy back live. */
  onRestore?: (id: string) => void
  /** HR only: deletes an archived policy for good. */
  onDeletePermanently?: (id: string) => void
  /** Extra controls under the categories (e.g. "Include archived"). */
  railFooter?: React.ReactNode
  emptyText?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('ALL')

  const q = search.trim().toLowerCase()
  const matching = useMemo(
    () =>
      policies.filter(
        (p) =>
          !q ||
          p.title.toLowerCase().includes(q) ||
          (p.description ?? '').toLowerCase().includes(q) ||
          (p.content ?? '').toLowerCase().includes(q),
      ),
    [policies, q],
  )

  // Archived policies are kept out of the categories and counted on their own,
  // under a separate Archived entry — only HR is ever sent any.
  const hasArchived = policies.some((p) => p.status === 'ARCHIVED')
  const liveMatching = matching.filter((p) => p.status !== 'ARCHIVED')
  const archivedMatching = matching.filter((p) => p.status === 'ARCHIVED')

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const p of matching) if (p.status !== 'ARCHIVED') c[p.category] = (c[p.category] ?? 0) + 1
    return c
  }, [matching])
  const categories = [
    ...CATEGORY_ORDER.filter((c) => counts[c]),
    ...Object.keys(counts).filter((c) => !CATEGORY_ORDER.includes(c)).sort(),
  ]

  const inCategory = (category === 'ARCHIVED' ? archivedMatching : liveMatching)
    .filter((p) => category === 'ALL' || category === 'ARCHIVED' || p.category === category)
    .sort((a, b) => a.title.localeCompare(b.title))

  const selectedId = searchParams.get('policy')
  const selected =
    inCategory.find((p) => p.id === selectedId) ??
    // A link to a policy opens it, but only in its own side of the list: the
    // Archived entry never shows a live policy, and a category never an archived one.
    policies.find((p) => p.id === selectedId && (category === 'ARCHIVED') === (p.status === 'ARCHIVED')) ??
    inCategory[0] ??
    null

  function open(id: string) {
    if (!window.matchMedia('(min-width: 1024px)').matches) {
      router.push(`/dashboard/policies/${id}`)
      return
    }
    const params = new URLSearchParams(searchParams.toString())
    params.set('policy', id)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <div className="grid gap-4 lg:h-[calc(100vh-13rem)] lg:min-h-[560px] lg:grid-cols-[220px_290px_minmax(0,1fr)]">
      {/* Categories */}
      <aside className="flex flex-col rounded-xl border border-slate-200 bg-white p-3 lg:overflow-y-auto">
        <label className="relative mb-4 block">
          <span className="sr-only">Search policies</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search policies"
            className="w-full rounded-md border border-slate-200 py-2 pl-8 pr-2 text-sm outline-none focus:border-slate-400"
          />
        </label>
        <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Categories</p>
        <ul className="space-y-0.5">
          {['ALL', ...categories].map((c) => {
            const on = category === c
            const n = c === 'ALL' ? liveMatching.length : counts[c] ?? 0
            return (
              <li key={c}>
                <button
                  type="button"
                  onClick={() => setCategory(c)}
                  aria-pressed={on}
                  className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
                    on ? 'bg-slate-900 font-medium text-white' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>{CATEGORY_LABEL[c] ?? c.replace(/_/g, ' ')}</span>
                  <span className={`text-xs tabular-nums ${on ? 'text-slate-300' : 'text-slate-400'}`}>{n}</span>
                </button>
              </li>
            )
          })}
        </ul>
        {hasArchived && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Archived</p>
            <button
              type="button"
              onClick={() => setCategory('ARCHIVED')}
              aria-pressed={category === 'ARCHIVED'}
              className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
                category === 'ARCHIVED' ? 'bg-slate-900 font-medium text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span>Archived policies</span>
              <span className={`text-xs tabular-nums ${category === 'ARCHIVED' ? 'text-slate-300' : 'text-slate-400'}`}>
                {archivedMatching.length}
              </span>
            </button>
          </div>
        )}
        {railFooter && <div className="mt-auto border-t border-slate-100 pt-3">{railFooter}</div>}
      </aside>

      {/* Policies in the category */}
      <nav className="rounded-xl border border-slate-200 bg-white lg:overflow-y-auto" aria-label="Policies">
        <p className="sticky top-0 z-10 border-b border-slate-100 bg-white px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {CATEGORY_LABEL[category] ?? category} · {inCategory.length}
        </p>
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400">Loading policies…</p>
        ) : inCategory.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">{q ? 'No policies match this search.' : emptyText}</p>
        ) : (
          <ul>
            {inCategory.map((p) => {
              const on = selected?.id === p.id
              const tag = category === 'ARCHIVED' ? undefined : NOT_LIVE[p.status]
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => open(p.id)}
                    aria-current={on ? 'true' : undefined}
                    className={`block w-full border-l-2 px-4 py-3 text-left text-sm leading-snug transition-colors ${
                      on
                        ? 'border-slate-900 bg-slate-100 font-semibold text-slate-900'
                        : 'border-transparent text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {p.title}
                    {tag && <span className="mt-1 block text-[11px] font-medium text-slate-500">{tag}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </nav>

      {/* The open policy */}
      <section className="hidden min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-100 lg:flex">
        {selected ? (
          <>
            <div className="flex flex-wrap items-center justify-end gap-2 border-b border-slate-200 bg-white px-4 py-2.5">
              {onEdit && (
                <Button size="sm" variant="outline" onClick={() => onEdit(selected.id)}>
                  Edit details
                </Button>
              )}
              {onArchive && selected.status !== 'ARCHIVED' && (
                <Button size="sm" variant="ghost" onClick={() => onArchive(selected.id)}>
                  Archive
                </Button>
              )}
              {onRestore && selected.status === 'ARCHIVED' && (
                <Button size="sm" variant="outline" onClick={() => onRestore(selected.id)}>
                  Restore
                </Button>
              )}
              {onDeletePermanently && selected.status === 'ARCHIVED' && (
                <Button size="sm" variant="destructive" onClick={() => onDeletePermanently(selected.id)}>
                  Delete permanently
                </Button>
              )}
              <Link href={`/dashboard/policies/${selected.id}`} className={buttonVariants({ size: 'sm' })}>
                {onEdit ? 'Open full page (print, approvals)' : 'Open full page to print'}
              </Link>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <PolicyDocument policy={selected} />
            </div>
          </>
        ) : (
          <p className="m-auto px-6 text-center text-sm text-slate-500">
            {loading ? 'Loading…' : 'Choose a policy from the list to read it here.'}
          </p>
        )}
      </section>
    </div>
  )
}

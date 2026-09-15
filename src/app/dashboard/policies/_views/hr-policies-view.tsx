'use client'

/**
 * Policies for HR: the library, with New policy and Edit details opening the
 * guided policy builder (/dashboard/policies/new and /[id]/edit) rather than a
 * one-screen form — a policy has too many parts to write well in a dialog.
 */
import { Suspense, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { PolicyLibrary } from '@/components/policies/policy-library'

type Policy = {
  id: string
  title: string
  type: string
  category: string
  description: string | null
  content: string | null
  url: string | null
  version: string
  effectiveDate: string | null
  audience: string
  audienceRoles: string | null
  requiresAck: boolean
  status: string
  publishedAt: string | null
  createdAt: string
  acknowledgments: { status: string; employeeId: string; signedAt: string | null }[]
}

export default function HRPoliciesView() {
  const router = useRouter()
  const [policies, setPolicies] = useState<Policy[]>([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)

  // Search and category filtering happen in the library, on the full list.
  const loadPolicies = useCallback(() => {
    return fetch('/api/policies')
      .then((res) => res.json())
      .then((data) => {
        setPolicies(data.policies ?? [])
        setLoading(false)
      })
  }, [])

  useEffect(() => { void loadPolicies() }, [loadPolicies])

  async function handleArchive(id: string) {
    if (!confirm('Archive this policy? It will no longer be visible to employees.')) return
    await fetch(`/api/policies/${id}`, { method: 'DELETE' })
    setLoading(true)
    await loadPolicies()
  }

  const visible = policies.filter((p) => showArchived || p.status !== 'ARCHIVED')
  // "Live" = workflow ACTIVE + legacy PUBLISHED rows.
  const liveCount = policies.filter((p) => p.status === 'ACTIVE' || p.status === 'PUBLISHED').length
  const draftCount = policies.filter((p) => p.status === 'DRAFT').length

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Policies</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {liveCount} live for employees{draftCount ? ` · ${draftCount} draft${draftCount === 1 ? '' : 's'} only you can see` : ''}.
            {' '}Choose a category, then a policy to read it on the right. New policy opens the guided builder.
          </p>
        </div>
        <Link href="/dashboard/policies/new" className={buttonVariants()}>
          <Plus className="w-4 h-4" /> New policy
        </Link>
      </div>

      <Suspense fallback={<div className="py-10 text-center text-sm text-slate-400">Loading…</div>}>
        <PolicyLibrary
          policies={visible}
          loading={loading}
          onEdit={(id) => router.push(`/dashboard/policies/${id}/edit`)}
          onArchive={handleArchive}
          emptyText="No policies yet. Use New policy to add one."
          railFooter={
            <label className="flex items-center gap-2 px-2 text-sm text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              Include archived policies
            </label>
          }
        />
      </Suspense>
    </div>
  )
}

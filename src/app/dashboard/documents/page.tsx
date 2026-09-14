'use client'

/**
 * Document Center — company policies.
 *
 * Letters (experience, salary cert, NOC, etc.) live in /dashboard/letters
 * which is the dedicated workflow surface for letter requests.
 * Per-employee files live on the employee profile (Documents tab).
 */

import { Suspense, useState, useEffect } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { PolicyLibrary, type LibraryPolicy } from '@/components/policies/policy-library'
import { FolderOpen } from 'lucide-react'

export default function DocumentCenterPage() {
  return (
    <div className="space-y-6">
      {/* Header — charcoal hero (branding) */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-6 text-white shadow-md">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-white/15 p-3 backdrop-blur">
            <FolderOpen className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">Document Center</h1>
            <p className="text-white/85 mt-1 text-sm">
              Company policies. Employee files live on each person&apos;s profile.
            </p>
          </div>
        </div>
      </div>

      {/* Pointer to Letters workflow (moved out) */}
      <Card className="border-slate-100 bg-slate-50/40">
        <div className="p-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-slate-900">Letter requests</p>
            <p className="text-xs text-slate-600 mt-0.5">
              Experience, salary certificate, NOC, confirmation, and other formal letters are managed in the Letters workflow.
            </p>
          </div>
          <Link href="/dashboard/letters" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Go to Letters
          </Link>
        </div>
      </Card>

      <CompanyPolicies />
    </div>
  )
}

/* ─────────────────────── POLICIES ─────────────────────── */

function CompanyPolicies() {
  const [policies, setPolicies] = useState<LibraryPolicy[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // /api/policies already applies each role's audience; HR also receives
    // drafts and archived rows, which do not belong in a reading library.
    fetch('/api/policies')
      .then((r) => r.json())
      .then((d) => {
        setPolicies(
          (d.policies ?? []).filter((p: LibraryPolicy) => p.status === 'ACTIVE' || p.status === 'PUBLISHED'),
        )
      })
      .catch(() => setPolicies([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Company policies</h2>
          <p className="text-sm text-slate-500">Choose a category, then a policy to read it on the right.</p>
        </div>
        <Link href="/dashboard/policies" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Go to Policies
        </Link>
      </div>
      <Suspense fallback={<div className="py-10 text-center text-sm text-slate-400">Loading…</div>}>
        <PolicyLibrary policies={policies} loading={loading} emptyText="No company policies are live yet." />
      </Suspense>
    </div>
  )
}

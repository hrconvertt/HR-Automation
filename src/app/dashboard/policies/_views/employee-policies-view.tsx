'use client'

/**
 * Policies for everyone who is not HR — Employee, Lead, Manager, Executive,
 * Finance. The same library HR uses, read-only: no edit, no archive. The API
 * already limits the list to live policies in the viewer's audience.
 *
 * (Acknowledgement schema and API endpoints are intact for future use.)
 */

import { Suspense, useEffect, useState } from 'react'
import { PolicyLibrary, type LibraryPolicy } from '@/components/policies/policy-library'

export default function EmployeePoliciesView() {
  const [policies, setPolicies] = useState<LibraryPolicy[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/policies')
      .then((r) => r.json())
      .then((d) => setPolicies(d.policies ?? []))
      .catch(() => setPolicies([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Policies</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Company policies, procedures and country terms. Choose a category, then a policy to read it.
        </p>
      </div>
      <Suspense fallback={<div className="py-10 text-center text-sm text-slate-400">Loading…</div>}>
        <PolicyLibrary policies={policies} loading={loading} emptyText="No policies have been published yet." />
      </Suspense>
    </div>
  )
}

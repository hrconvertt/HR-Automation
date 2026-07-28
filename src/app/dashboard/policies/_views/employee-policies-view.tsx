'use client'

/**
 * Universal Policies Library — read-only.
 *
 * Used for Employee, Manager, Executive. No signing UX, no pending banners,
 * no compliance tracking. Just a searchable, category-filterable list of
 * company policies. Click into one to read the full content.
 *
 * (Acknowledgement schema and API endpoints are intact for future use.)
 */

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { FileText, Search, ExternalLink } from 'lucide-react'
import { formatDate } from '@/lib/utils'

type Policy = {
  id: string
  title: string
  category: string
  description: string | null
  url: string | null
  version: string
  effectiveDate: string | null
}

const CATEGORIES = ['ALL', 'LEAVE', 'CODE_OF_CONDUCT', 'IT', 'SECURITY', 'COMPENSATION', 'GENERAL']
const catLabels: Record<string, string> = {
  ALL: 'All', LEAVE: 'Leave', CODE_OF_CONDUCT: 'Code of Conduct',
  IT: 'IT', SECURITY: 'Security', COMPENSATION: 'Compensation', GENERAL: 'General',
}
const CAT_STRIPE: Record<string, string> = {
  LEAVE:           'border-slate-500',
  CODE_OF_CONDUCT: 'border-slate-500',
  IT:              'border-slate-500',
  SECURITY:        'border-slate-500',
  COMPENSATION:    'border-slate-500',
  GENERAL:         'border-slate-400',
}

export default function EmployeePoliciesView() {
  const [policies, setPolicies] = useState<Policy[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('ALL')

  const fetchPolicies = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (category !== 'ALL') params.set('category', category)
    if (search) params.set('q', search)
    const res = await fetch(`/api/policies?${params}`)
    const data = await res.json()
    setPolicies(data.policies ?? [])
    setLoading(false)
  }, [category, search])

  useEffect(() => { fetchPolicies() }, [fetchPolicies])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Policies</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Company policies, guidelines, and reference documents.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 flex-1 min-w-[240px] bg-white border border-slate-200 rounded-lg px-3">
          <Search className="w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search policies…"
            className="border-0 focus-visible:ring-0 px-1"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                category === c ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {catLabels[c]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-center text-slate-400 py-10">Loading…</p>
      ) : policies.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-slate-400">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
            No policies match.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {policies.map((p) => {
            const catStripe = CAT_STRIPE[p.category] ?? 'border-slate-300'
            return (
              <Link key={p.id} href={`/dashboard/policies/${p.id}`} className="group">
                <Card className={`hover:shadow-md transition-shadow cursor-pointer h-full border-l-4 ${catStripe}`}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 group-hover:text-slate-700 truncate">{p.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 uppercase tracking-wider font-medium">
                        {catLabels[p.category] ?? p.category} · v{p.version}
                      </p>
                    </div>
                    {p.description && <p className="text-sm text-slate-600 line-clamp-2">{p.description}</p>}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-slate-400">
                        {p.effectiveDate ? `Effective ${formatDate(p.effectiveDate)}` : 'Reference document'}
                      </span>
                      {p.url && <ExternalLink className="w-3.5 h-3.5 text-slate-400" />}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

'use client'

/**
 * The role picker above the pipeline.
 *
 * It used to sit inside BulkPipelineActions and scope only the two bulk
 * buttons, so choosing "QA Engineer" left the board showing every candidate for
 * every role — the CRO Strategists stayed in SCREENING under a heading that
 * said QA. A control that looks like a filter has to filter.
 *
 * The choice goes in the URL rather than component state: the board is
 * server-rendered, so the server does the filtering, and a filtered pipeline
 * can be linked to and survives a refresh.
 */

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTransition } from 'react'
import { Loader2 } from 'lucide-react'

export interface RoleOption { id: string; title: string; count: number }

export function PipelineRoleFilter({ roles, selected }: {
  roles: RoleOption[]
  /** Empty string means every role. */
  selected: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  function choose(id: string) {
    const next = new URLSearchParams(params.toString())
    if (id) next.set('role', id)
    else next.delete('role')
    startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }))
  }

  const total = roles.reduce((n, r) => n + r.count, 0)

  return (
    <div className="flex items-center gap-2">
      <select
        value={selected}
        onChange={(e) => choose(e.target.value)}
        className="px-3 py-1.5 rounded-md border border-slate-300 bg-white text-sm max-w-[280px]"
        aria-label="Filter the pipeline by role"
      >
        <option value="">All roles ({total})</option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.title} ({r.count})
          </option>
        ))}
      </select>
      {pending && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
    </div>
  )
}

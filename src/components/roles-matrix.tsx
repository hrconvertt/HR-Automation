'use client'

import { useCallback, useEffect, useState } from 'react'
import { Star, Search } from 'lucide-react'

interface Row {
  id: string
  email: string
  fullName: string
  designation: string | null
  department: string | null
  primaryRole: string
  roles: string[]
}

interface ApiResponse {
  rows: Row[]
  stats: Record<string, number>
}

const ROLES = ['HR_ADMIN', 'MANAGER', 'EMPLOYEE', 'EXECUTIVE'] as const
const ROLE_COLORS: Record<string, string> = {
  HR_ADMIN: 'bg-purple-500',
  MANAGER: 'bg-blue-500',
  EMPLOYEE: 'bg-emerald-500',
  EXECUTIVE: 'bg-amber-500',
}
const ROLE_LABELS: Record<string, string> = {
  HR_ADMIN: 'HR Admin',
  MANAGER: 'Manager',
  EMPLOYEE: 'Employee',
  EXECUTIVE: 'Executive',
}

export default function RolesMatrix() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/admin/roles-matrix', { cache: 'no-store' })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${r.status}`)
      }
      setData((await r.json()) as ApiResponse)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function toggle(userId: string, role: string, hasRole: boolean) {
    const key = `${userId}:${role}`
    setPending(key)
    try {
      const r = await fetch(`/api/admin/roles-matrix/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, action: hasRole ? 'remove' : 'add' }),
      })
      const j = await r.json()
      if (!r.ok) {
        alert(j.error ?? 'Failed')
      } else {
        await fetchData()
      }
    } finally {
      setPending(null)
    }
  }

  async function setPrimary(userId: string, role: string) {
    const key = `${userId}:primary:${role}`
    setPending(key)
    try {
      const r = await fetch(`/api/admin/roles-matrix/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, action: 'set-primary' }),
      })
      const j = await r.json()
      if (!r.ok) {
        alert(j.error ?? 'Failed')
      } else {
        await fetchData()
      }
    } finally {
      setPending(null)
    }
  }

  if (loading && !data) {
    return <div className="py-20 text-center text-sm text-gray-400">Loading…</div>
  }
  if (error) {
    return (
      <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm">
        {error}
      </div>
    )
  }
  if (!data) return null

  const q = query.trim().toLowerCase()
  const filtered = q
    ? data.rows.filter(
        (r) =>
          r.fullName.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          (r.designation ?? '').toLowerCase().includes(q) ||
          (r.department ?? '').toLowerCase().includes(q),
      )
    : data.rows

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name, email, role…"
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
        />
      </div>

      {/* Matrix */}
      <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-700 sticky left-0 bg-gray-50">
                Employee
              </th>
              {ROLES.map((role) => (
                <th key={role} className="px-3 py-3 text-center font-semibold text-gray-700">
                  <div className="flex items-center justify-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${ROLE_COLORS[role]}`} />
                    {ROLE_LABELS[role]}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                <td className="px-4 py-2.5 sticky left-0 bg-white">
                  <p className="font-medium text-gray-900 text-[13px]">{row.fullName}</p>
                  <p className="text-[11px] text-gray-500 truncate max-w-xs">
                    {row.designation ?? row.email}
                    {row.department ? ` · ${row.department}` : ''}
                  </p>
                </td>
                {ROLES.map((role) => {
                  const has = row.roles.includes(role)
                  const isPrimary = row.primaryRole === role
                  const key = `${row.id}:${role}`
                  const primaryKey = `${row.id}:primary:${role}`
                  const isPending = pending === key || pending === primaryKey
                  return (
                    <td key={role} className="px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => toggle(row.id, role, has)}
                          disabled={isPending}
                          title={has ? `Remove ${ROLE_LABELS[role]}` : `Grant ${ROLE_LABELS[role]}`}
                          className={`
                            w-6 h-6 rounded-full transition-all flex items-center justify-center
                            ${
                              has
                                ? `${ROLE_COLORS[role]} text-white shadow-sm`
                                : 'bg-gray-100 hover:bg-gray-200 border border-gray-200'
                            }
                            ${isPending ? 'opacity-50' : ''}
                          `}
                        >
                          {has && <span className="block w-1.5 h-1.5 bg-white rounded-full" />}
                        </button>
                        {has && (
                          <button
                            onClick={() => !isPrimary && setPrimary(row.id, role)}
                            disabled={isPending || isPrimary}
                            title={isPrimary ? 'Primary view' : 'Set as primary'}
                            className={`p-0.5 rounded ${
                              isPrimary
                                ? 'text-amber-500'
                                : 'text-gray-300 hover:text-amber-400'
                            }`}
                          >
                            <Star
                              className="w-3.5 h-3.5"
                              fill={isPrimary ? 'currentColor' : 'none'}
                            />
                          </button>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={ROLES.length + 1} className="px-4 py-10 text-center text-gray-400 text-sm">
                  No users match the filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Stats footer */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-600">
        {ROLES.map((role) => (
          <span key={role} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${ROLE_COLORS[role]}`} />
            <strong className="text-gray-900">{data.stats[role] ?? 0}</strong>
            <span className="text-gray-500">{ROLE_LABELS[role]}s</span>
          </span>
        ))}
      </div>
    </div>
  )
}

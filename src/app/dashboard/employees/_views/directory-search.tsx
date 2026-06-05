'use client'

import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { getInitials } from '@/lib/utils'
import { Search, Mail } from 'lucide-react'

interface DirectoryEmployee {
  id: string
  employeeCode: string
  fullName: string
  email: string
  designation: string
  department: string
}

interface Props {
  currentUserId: string
  employees: DirectoryEmployee[]
}

// Same deterministic palette as the HR & Manager views — keeps a colleague's
// avatar consistent across roles.
const AVATAR_PALETTE = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-purple-100 text-purple-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-sky-100 text-sky-700',
  'bg-indigo-100 text-indigo-700',
  'bg-teal-100 text-teal-700',
]
function avatarTone(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]
}

export function DirectorySearch({ currentUserId, employees }: Props) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    if (!query.trim()) return employees
    const q = query.toLowerCase()
    return employees.filter((e) =>
      e.fullName.toLowerCase().includes(q) ||
      e.designation.toLowerCase().includes(q) ||
      e.department.toLowerCase().includes(q) ||
      e.email.toLowerCase().includes(q),
    )
  }, [query, employees])

  return (
    <Card className="rounded-xl border-slate-200 overflow-hidden shadow-sm">
      {/* Toolbar — search on the left, count on the right */}
      <div className="px-4 py-3 border-b border-slate-100 bg-white flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search by name, role, department, or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 bg-white"
          />
        </div>
        <span className="text-xs text-slate-500 ml-auto">
          {filtered.length} of {employees.length}
        </span>
      </div>

      {/* Card grid */}
      <div className="p-4 bg-slate-50/50">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            No people match your search.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map((emp) => {
              const isMe = emp.id === currentUserId
              return (
                <div
                  key={emp.id}
                  className={`bg-white border rounded-xl p-4 transition-all ${
                    isMe
                      ? 'border-emerald-300 ring-1 ring-emerald-200'
                      : 'border-slate-200 hover:border-emerald-300 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${avatarTone(emp.fullName)}`}>
                      {getInitials(emp.fullName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-slate-900 text-sm leading-tight truncate">
                          {emp.fullName}
                        </p>
                        {isMe && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                            You
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5 truncate">{emp.designation}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">{emp.department}</p>
                      <a
                        href={`mailto:${emp.email}`}
                        className="flex items-center gap-1 mt-2 text-[11px] text-blue-600 hover:underline truncate"
                      >
                        <Mail className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{emp.email}</span>
                      </a>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Card>
  )
}

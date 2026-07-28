'use client'

import { useState, useMemo } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Search } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { LETTER_TYPE_LABEL, LETTER_TYPES, type LetterType } from '@/lib/letter-templates'
import { LetterActions } from '@/components/letters/letter-actions'

type Role = 'HR_ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'EXECUTIVE'

export interface LetterRow {
  id: string
  letterNumber: string | null
  letterType: string
  purpose: string | null
  destinationCountry: string | null
  bankName: string | null
  travelFrom: string | null
  travelTo: string | null
  status: string
  rejectionReason: string | null
  requestedAt: string
  employeeId: string
  employee: {
    id: string
    employeeCode: string
    fullName: string
    designation: string
    department: { name: string } | null
  }
}

const STATUS_VARIANT: Record<string, 'success' | 'default' | 'warning' | 'secondary' | 'destructive'> = {
  PENDING: 'warning',
  APPROVED: 'default',
  GENERATED: 'success',
  REJECTED: 'destructive',
}

const STATUS_OPTIONS = ['PENDING', 'APPROVED', 'GENERATED', 'REJECTED'] as const

function typeLabel(t: string): string {
  return LETTER_TYPE_LABEL[t as LetterType] ?? t.replace(/_/g, ' ')
}

interface Props {
  letters: LetterRow[]
  role: Role
  employeeId: string | null
  isPreviewMode: boolean
}

export function LettersBoard({ letters, role, employeeId, isPreviewMode }: Props) {
  const [activeTab, setActiveTab] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'GENERATED' | 'REJECTED'>(
    role === 'HR_ADMIN' ? 'PENDING' : 'ALL',
  )
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    return letters.filter((l) => {
      if (activeTab !== 'ALL' && l.status !== activeTab) return false
      if (typeFilter && l.letterType !== typeFilter) return false
      if (statusFilter && l.status !== statusFilter) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const name = l.employee.fullName.toLowerCase()
        const code = l.employee.employeeCode.toLowerCase()
        if (!name.includes(q) && !code.includes(q)) return false
      }
      return true
    })
  }, [letters, activeTab, typeFilter, statusFilter, search])

  const counts = useMemo(
    () => ({
      ALL: letters.length,
      PENDING: letters.filter((l) => l.status === 'PENDING').length,
      APPROVED: letters.filter((l) => l.status === 'APPROVED').length,
      GENERATED: letters.filter((l) => l.status === 'GENERATED').length,
      REJECTED: letters.filter((l) => l.status === 'REJECTED').length,
    }),
    [letters],
  )

  function renderTable(rows: LetterRow[]) {
    if (rows.length === 0) {
      return <Card className="p-10 text-center text-gray-400 text-sm">No letter requests match your filters.</Card>
    }
    return (
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Letter #</TableHead>
              {role !== 'EMPLOYEE' && <TableHead>Employee</TableHead>}
              <TableHead>Type</TableHead>
              <TableHead>Purpose</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Requested On</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((l) => {
              const isOwn = l.employeeId === employeeId
              const canDelete =
                (isOwn && l.status === 'PENDING' && !isPreviewMode) ||
                (role === 'HR_ADMIN' && !isPreviewMode)
              const details =
                l.letterType === 'NOC_VISA'
                  ? `${l.destinationCountry ?? '—'}${l.travelFrom ? ` · ${formatDate(l.travelFrom)} → ${l.travelTo ? formatDate(l.travelTo) : '—'}` : ''}`
                  : l.letterType === 'SALARY_CERTIFICATE'
                    ? (l.bankName ?? l.purpose ?? '—')
                    : (l.purpose ?? '—')
              return (
                <TableRow key={l.id} className="hover:bg-slate-50/60 transition">
                  <TableCell className="py-3 font-mono text-xs">{l.letterNumber ?? '—'}</TableCell>
                  {role !== 'EMPLOYEE' && (
                    <TableCell className="py-3">
                      <p className="font-medium text-sm">{l.employee.fullName}</p>
                      <p className="text-xs text-gray-400">{l.employee.employeeCode} · {l.employee.designation}</p>
                    </TableCell>
                  )}
                  <TableCell className="py-3">
                    <Badge variant="secondary">{typeLabel(l.letterType)}</Badge>
                  </TableCell>
                  <TableCell className="py-3 text-sm text-gray-700 max-w-xs truncate" title={details}>
                    {details}
                  </TableCell>
                  <TableCell className="py-3">
                    <Badge variant={STATUS_VARIANT[l.status] ?? 'default'}>{l.status}</Badge>
                    {l.status === 'REJECTED' && l.rejectionReason && (
                      <p className="text-[11px] text-slate-700 mt-1 max-w-[200px]">{l.rejectionReason}</p>
                    )}
                  </TableCell>
                  <TableCell className="py-3 text-sm text-gray-600">{formatDate(l.requestedAt)}</TableCell>
                  <TableCell className="py-3">
                    <div className="flex justify-end">
                      <LetterActions
                        letterId={l.id}
                        status={l.status}
                        role={role}
                        canDelete={canDelete}
                        isPreviewMode={isPreviewMode}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="ALL">All ({counts.ALL})</TabsTrigger>
          <TabsTrigger value="PENDING">Pending ({counts.PENDING})</TabsTrigger>
          <TabsTrigger value="APPROVED">Approved ({counts.APPROVED})</TabsTrigger>
          <TabsTrigger value="GENERATED">Generated ({counts.GENERATED})</TabsTrigger>
          <TabsTrigger value="REJECTED">Rejected ({counts.REJECTED})</TabsTrigger>
        </TabsList>

        {/* Filters row */}
        <div className="mt-4 flex flex-col gap-3">
          {/* Search */}
          {role !== 'EMPLOYEE' && (
            <div className="relative max-w-sm">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search employee name or code…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          )}

          {/* Type chips */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs uppercase tracking-wide text-slate-500 mr-1">Type:</span>
            <Chip active={typeFilter === null} onClick={() => setTypeFilter(null)}>All types</Chip>
            {LETTER_TYPES.map((t) => (
              <Chip key={t} active={typeFilter === t} onClick={() => setTypeFilter(typeFilter === t ? null : t)}>
                {LETTER_TYPE_LABEL[t]}
              </Chip>
            ))}
          </div>

          {/* Status chips */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs uppercase tracking-wide text-slate-500 mr-1">Status:</span>
            <Chip active={statusFilter === null} onClick={() => setStatusFilter(null)}>All</Chip>
            {STATUS_OPTIONS.map((s) => (
              <Chip key={s} active={statusFilter === s} onClick={() => setStatusFilter(statusFilter === s ? null : s)}>
                {s}
              </Chip>
            ))}
          </div>
        </div>

        {/* Single tab content — we filter in-memory */}
        <TabsContent value={activeTab} className="mt-4">
          {renderTable(filtered)}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition ' +
        (active
          ? 'bg-slate-900 text-white border-slate-900'
          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50')
      }
    >
      {children}
    </button>
  )
}

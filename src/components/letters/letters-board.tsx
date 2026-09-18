'use client'

/**
 * Letter requests: every letter asked for or written, stored, in one place.
 *
 * One row of tabs sorts them by where they stand (Received, Approved, Issued,
 * Rejected, All); the letter type is a dropdown rather than a menu entry per
 * type. Picking a letter opens it on the right: what was asked for, who dealt
 * with it, the letter itself on the letterhead, and the buttons for the next
 * step, each saying what it does.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Download, FileText, Loader2, PenLine, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toastError, toastSuccess } from '@/components/ui/toaster'
import { cn, formatDate } from '@/lib/utils'
import { letterLabel } from '@/lib/letter-text'

type Role = 'HR_ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'EXECUTIVE'
type Tab = 'PENDING' | 'APPROVED' | 'GENERATED' | 'REJECTED' | 'ALL'

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
  reviewedAt: string | null
  signedByName: string | null
  /** Written by HR in Write a letter rather than asked for by the employee. */
  writtenByHr: boolean
  employeeId: string
  employee: {
    id: string
    employeeCode: string
    fullName: string
    designation: string
    department: { name: string } | null
  }
}

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-800 border-amber-200',
  APPROVED: 'bg-sky-50 text-sky-800 border-sky-200',
  GENERATED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  REJECTED: 'bg-red-50 text-red-800 border-red-200',
}

function statusLabel(status: string, isHr: boolean): string {
  if (status === 'PENDING') return isHr ? 'Received' : 'Waiting for HR'
  if (status === 'GENERATED') return 'Issued'
  return status.charAt(0) + status.slice(1).toLowerCase()
}

interface Props {
  letters: LetterRow[]
  role: Role
  employeeId: string | null
  isPreviewMode: boolean
  initial: { open: string | null; status: string | null; type: string | null }
}

export function LettersBoard({ letters, role, employeeId, isPreviewMode, initial }: Props) {
  const router = useRouter()
  const isHr = role === 'HR_ADMIN' && !isPreviewMode
  const seesOthers = role !== 'EMPLOYEE'

  const opened = initial.open ? letters.find((l) => l.id === initial.open) : undefined
  const [tab, setTab] = useState<Tab>(() => {
    if (opened) return 'ALL'
    const s = initial.status?.toUpperCase()
    if (s === 'PENDING' || s === 'APPROVED' || s === 'GENERATED' || s === 'REJECTED' || s === 'ALL') return s
    return role === 'HR_ADMIN' && letters.some((l) => l.status === 'PENDING') ? 'PENDING' : 'ALL'
  })
  const [type, setType] = useState(initial.type ?? '')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(opened?.id ?? null)

  // Keep the address in step, so a refresh or a shared link opens the same view.
  useEffect(() => {
    const q = new URLSearchParams()
    if (tab !== 'ALL') q.set('status', tab.toLowerCase())
    if (type) q.set('type', type)
    if (selectedId) q.set('open', selectedId)
    const qs = q.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
  }, [tab, type, selectedId])

  const types = useMemo(() => {
    const seen = new Set(letters.map((l) => l.letterType))
    return Array.from(seen).sort((a, b) => letterLabel(a).localeCompare(letterLabel(b)))
  }, [letters])

  const matchesFilters = (l: LetterRow) => {
    if (type && l.letterType !== type) return false
    const q = search.trim().toLowerCase()
    if (q && !`${l.employee.fullName} ${l.employee.employeeCode} ${l.letterNumber ?? ''}`.toLowerCase().includes(q)) return false
    return true
  }
  const filtered = letters.filter(matchesFilters)
  const counts: Record<Tab, number> = {
    PENDING: filtered.filter((l) => l.status === 'PENDING').length,
    APPROVED: filtered.filter((l) => l.status === 'APPROVED').length,
    GENERATED: filtered.filter((l) => l.status === 'GENERATED').length,
    REJECTED: filtered.filter((l) => l.status === 'REJECTED').length,
    ALL: filtered.length,
  }
  const rows = tab === 'ALL' ? filtered : filtered.filter((l) => l.status === tab)
  const selected = letters.find((l) => l.id === selectedId) ?? null

  const TABS: { key: Tab; label: string }[] = [
    { key: 'PENDING', label: isHr || role === 'HR_ADMIN' ? 'Received' : 'Waiting for HR' },
    { key: 'APPROVED', label: 'Approved' },
    { key: 'GENERATED', label: 'Issued' },
    { key: 'REJECTED', label: 'Rejected' },
    { key: 'ALL', label: 'All' },
  ]

  return (
    <div className="space-y-4">
      {/* Where they stand */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 w-fit max-w-full">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'rounded-lg px-3.5 py-1.5 text-sm font-medium transition',
              tab === t.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
            )}
          >
            {t.label} <span className={cn('ml-1 text-xs', tab === t.key ? 'text-white/70' : 'text-slate-400')}>{counts[t.key]}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 sm:w-64"
          aria-label="Letter type"
        >
          <option value="">All letter types</option>
          {types.map((t) => <option key={t} value={t}>{letterLabel(t)}</option>)}
        </select>
        {seesOthers && (
          <div className="relative sm:w-80">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, code or letter number"
              className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 text-sm"
            />
          </div>
        )}
        {(type || search) && (
          <button type="button" onClick={() => { setType(''); setSearch('') }} className="text-sm text-slate-600 underline underline-offset-2 hover:text-slate-900">
            Clear filters
          </button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] items-start">
        {/* The list */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          {rows.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <FileText className="mx-auto mb-2 h-7 w-7 text-slate-300" />
              <p className="text-sm text-slate-500">
                {letters.length === 0 ? 'No letters yet.' : `No ${tab === 'ALL' ? '' : TABS.find((t) => t.key === tab)!.label.toLowerCase() + ' '}letters${type || search ? ' match these filters' : ''}.`}
              </p>
            </div>
          ) : (
            <ul className="max-h-[70vh] overflow-y-auto divide-y divide-slate-100">
              {rows.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(l.id)}
                    className={cn('w-full px-4 py-3 text-left transition hover:bg-slate-50', l.id === selectedId && 'bg-slate-100 hover:bg-slate-100')}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {seesOthers ? l.employee.fullName : letterLabel(l.letterType)}
                      </p>
                      <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium', STATUS_STYLE[l.status])}>
                        {statusLabel(l.status, role === 'HR_ADMIN')}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 truncate">
                      {seesOthers ? `${letterLabel(l.letterType)} · ` : ''}{l.writtenByHr ? 'Written by HR' : 'Requested'} {formatDate(l.requestedAt)}
                      {l.letterNumber ? ` · ${l.letterNumber}` : ''}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* The chosen letter */}
        {selected ? (
          <LetterPanel
            key={selected.id}
            letter={selected}
            role={role}
            isHr={isHr}
            isOwn={selected.employeeId === employeeId}
            isPreviewMode={isPreviewMode}
            onClose={() => setSelectedId(null)}
            onChanged={() => router.refresh()}
            onDeleted={() => { setSelectedId(null); router.refresh() }}
          />
        ) : (
          <div className="hidden lg:flex rounded-xl border border-dashed border-slate-300 bg-white/60 min-h-[320px] items-center justify-center px-6 text-center">
            <p className="text-sm text-slate-500">Pick a letter on the left to see its details and the letter itself.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function LetterPanel({
  letter: l, role, isHr, isOwn, isPreviewMode, onClose, onChanged, onDeleted,
}: {
  letter: LetterRow
  role: Role
  isHr: boolean
  isOwn: boolean
  isPreviewMode: boolean
  onClose: () => void
  onChanged: () => void
  onDeleted: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')

  const issued = l.status === 'APPROVED' || l.status === 'GENERATED'
  const showLetter = issued || (isHr && l.status === 'PENDING')
  const pdf = `/api/letters/${l.id}/pdf`

  async function patch(body: Record<string, unknown>, done: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/letters/${l.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? 'That did not work.')
      toastSuccess(done)
      setRejecting(false)
      onChanged()
    } catch (e) {
      toastError('Could not update the letter', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    const what = isOwn && !isHr ? 'Withdraw this request?' : 'Delete this letter for good? This cannot be undone.'
    if (!window.confirm(what)) return
    setBusy(true)
    const res = await fetch(`/api/letters/${l.id}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      toastError('Could not delete', d.error)
      return
    }
    toastSuccess(isOwn && !isHr ? 'Request withdrawn' : 'Letter deleted')
    onDeleted()
  }

  const details: [string, string][] = [
    ['Employee', `${l.employee.fullName} · ${l.employee.employeeCode}`],
    ['Role', [l.employee.designation, l.employee.department?.name].filter(Boolean).join(' · ') || '—'],
    ['Letter', letterLabel(l.letterType)],
    ...(l.purpose ? [['Purpose', l.purpose] as [string, string]] : []),
    ...(l.bankName ? [['Addressed to', l.bankName] as [string, string]] : []),
    ...(l.destinationCountry ? [['Country', l.destinationCountry] as [string, string]] : []),
    ...(l.travelFrom ? [['Travel dates', `${formatDate(l.travelFrom)} to ${l.travelTo ? formatDate(l.travelTo) : '—'}`] as [string, string]] : []),
    [l.writtenByHr ? 'Written' : 'Requested', formatDate(l.requestedAt)],
    ...(l.reviewedAt && !l.writtenByHr ? [[l.status === 'REJECTED' ? 'Rejected' : 'Approved', formatDate(l.reviewedAt)] as [string, string]] : []),
    ...(l.signedByName && issued ? [['Signed by', l.signedByName] as [string, string]] : []),
    ...(l.letterNumber ? [['Letter number', l.letterNumber] as [string, string]] : []),
  ]

  const canDelete = !isPreviewMode && ((role === 'HR_ADMIN') || (isOwn && l.status === 'PENDING'))

  return (
    <div className="rounded-xl border border-slate-200 bg-white lg:sticky lg:top-4">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold text-slate-900">{letterLabel(l.letterType)}</h2>
            <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', STATUS_STYLE[l.status])}>
              {statusLabel(l.status, role === 'HR_ADMIN')}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-slate-500">{l.employee.fullName}</p>
        </div>
        <button type="button" onClick={onClose} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800">
          <X className="h-3.5 w-3.5" /> Close
        </button>
      </div>

      {/* Next step */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
        {isHr && l.status === 'PENDING' && (
          <>
            <Link href={`/dashboard/letters/write?request=${l.id}`}>
              <Button size="sm"><PenLine className="h-3.5 w-3.5" /> Review & approve</Button>
            </Link>
            <Button size="sm" variant="outline" onClick={() => setRejecting((v) => !v)} disabled={busy}>Reject request</Button>
          </>
        )}
        {issued && (
          <a href={`${pdf}?download=1`}>
            <Button size="sm" variant={isHr ? 'outline' : 'default'}><Download className="h-3.5 w-3.5" /> Download PDF</Button>
          </a>
        )}
        {isHr && issued && (
          <Link href={`/dashboard/letters/write?letter=${l.id}`}>
            <Button size="sm" variant="outline"><PenLine className="h-3.5 w-3.5" /> Edit letter</Button>
          </Link>
        )}
        {isHr && l.status === 'APPROVED' && (
          <Button size="sm" variant="outline" onClick={() => patch({ action: 'MARK_GENERATED' }, 'Marked as issued')} disabled={busy}>
            Mark as issued
          </Button>
        )}
        {canDelete && (
          <Button size="sm" variant="ghost" onClick={remove} disabled={busy} className="text-slate-600">
            {isOwn && !isHr ? 'Withdraw request' : 'Delete letter'}
          </Button>
        )}
        {busy && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
      </div>

      {rejecting && (
        <div className="space-y-2 border-b border-slate-100 bg-slate-50 px-5 py-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600" htmlFor="reject-reason">
            Why is it rejected? The employee sees this.
          </label>
          <textarea
            id="reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            placeholder="e.g. Probation is not complete yet."
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => patch({ action: 'REJECT', rejectionReason: reason }, 'Request rejected')} disabled={busy || !reason.trim()}>
              Reject request
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
        <dl className="space-y-3 text-sm">
          {details.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k}</dt>
              <dd className="mt-0.5 text-slate-900 break-words">{v}</dd>
            </div>
          ))}
          {l.status === 'REJECTED' && l.rejectionReason && (
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Reason</dt>
              <dd className="mt-0.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-red-900">{l.rejectionReason}</dd>
            </div>
          )}
        </dl>

        <div className="min-w-0">
          {showLetter ? (
            <>
              <p className="mb-2 text-xs text-slate-500">
                {issued ? 'The letter as issued.' : 'How the letter will read, written from the record. Review & approve lets you change any line first.'}
              </p>
              <iframe
                title={`${letterLabel(l.letterType)} for ${l.employee.fullName}`}
                src={`${pdf}#toolbar=0&navpanes=0&view=FitH`}
                className="w-full rounded-lg border border-slate-200 bg-slate-100"
                style={{ aspectRatio: '595 / 842' }}
              />
            </>
          ) : (
            <div className="flex min-h-[240px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 text-center">
              <p className="text-sm text-slate-500">
                {l.status === 'REJECTED' ? 'This request was rejected, so there is no letter.' : 'HR has not approved this request yet. The letter appears here once it is.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

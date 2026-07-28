'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { CalendarPlus, AlertCircle } from 'lucide-react'

// Convertt runs only Biannual (every 6 months) and Annual reviews.
// PROBATION is a separate workflow for new joiners — kept available.
const REVIEW_TYPES = [
  { value: 'BIANNUAL',  label: 'Biannual Review (6-Month)', uses: 'half' },
  { value: 'ANNUAL',    label: 'Annual Review',             uses: 'year' },
  { value: 'PROBATION', label: 'Probation Review',          uses: 'year' },
] as const

const HALVES = [
  { value: 'H1', label: 'H1 (Jan–Jun)' },
  { value: 'H2', label: 'H2 (Jul–Dec)' },
]

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'secondary'> = {
  PENDING: 'warning', SELF_SUBMITTED: 'default', MANAGER_REVIEWED: 'default', HR_FINALIZED: 'success',
}

interface CycleSummary {
  reviewPeriod: string
  reviewType: string
  total: number
}

export function OpenCycleButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [existing, setExisting] = useState<CycleSummary[]>([])

  const now = new Date()
  const currentHalf = now.getMonth() < 6 ? 'H1' : 'H2'
  const currentYear = String(now.getFullYear())

  const [form, setForm] = useState({
    reviewType: 'BIANNUAL',
    half: currentHalf,
    year: currentYear,
  })

  // Year options: previous, current, next two
  const YEARS = useMemo(() => {
    const y = now.getFullYear()
    return [y - 1, y, y + 1, y + 2].map(String)
  }, [now])

  // Compute the period string from the dropdown values + type
  const computedPeriod = useMemo(() => {
    const t = REVIEW_TYPES.find((r) => r.value === form.reviewType)
    if (t?.uses === 'half') return `${form.half}-${form.year}`
    return `${form.year}` // year-only (Annual / Probation)
  }, [form])

  // Fetch existing cycles when dialog opens
  useEffect(() => {
    if (!open) return
    fetch('/api/performance/reviews')
      .then((r) => r.json())
      .then((d) => {
        const grouped: Record<string, CycleSummary> = {}
        for (const rev of d.reviews ?? []) {
          const key = `${rev.reviewType}|${rev.reviewPeriod}`
          if (!grouped[key]) grouped[key] = { reviewPeriod: rev.reviewPeriod, reviewType: rev.reviewType, total: 0 }
          grouped[key].total++
        }
        setExisting(Object.values(grouped).slice(0, 8))
      })
      .catch(() => {})
  }, [open])

  const isDuplicate = existing.some((c) => c.reviewType === form.reviewType && c.reviewPeriod === computedPeriod)

  async function handleOpen() {
    setError('')
    setSuccess('')
    setSaving(true)
    const res = await fetch('/api/performance/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reviewType: form.reviewType,
        reviewPeriod: computedPeriod,
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error || 'Failed to open cycle'); return }
    setSuccess(`✓ Opened: ${data.cycleOpened} — ${data.reviewsCreated} draft reviews created${data.goalsLinked ? `, ${data.goalsLinked} goals linked` : ''}`)
    setTimeout(() => {
      setOpen(false)
      setSuccess('')
      router.refresh()
    }, 1800)
  }

  const typeMeta = REVIEW_TYPES.find((r) => r.value === form.reviewType)

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <CalendarPlus className="w-4 h-4" />
        Open Review Cycle
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Open New Review Cycle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              This creates a draft performance review for every active employee. They&apos;ll be notified to start their self-appraisal.
            </p>

            {/* Review Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Review Type</label>
              <Select value={form.reviewType} onValueChange={(v) => setForm({ ...form, reviewType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REVIEW_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Period selector — changes based on type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Period</label>
              <div className="grid grid-cols-2 gap-3">
                {typeMeta?.uses === 'half' && (
                  <Select value={form.half} onValueChange={(v) => setForm({ ...form, half: v })}>
                    <SelectTrigger><SelectValue placeholder="Half" /></SelectTrigger>
                    <SelectContent>
                      {HALVES.map((h) => (
                        <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Select value={form.year} onValueChange={(v) => setForm({ ...form, year: v })}>
                  <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
                  <SelectContent>
                    {YEARS.map((y) => (
                      <SelectItem key={y} value={y}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {typeMeta?.uses === 'year' && <div />}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Cycle will be saved as: <code className="bg-gray-100 px-1 rounded font-mono">{computedPeriod}</code>
              </p>
            </div>

            {/* Duplicate warning */}
            {isDuplicate && (
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-slate-700 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-slate-900">
                  A <strong>{typeMeta?.label}</strong> for <strong>{computedPeriod}</strong> already exists.
                  Pick a different period to avoid duplication.
                </div>
              </div>
            )}

            {/* Existing cycles list */}
            {existing.length > 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Existing cycles</p>
                <div className="flex flex-wrap gap-1.5">
                  {existing.map((c) => (
                    <Badge key={`${c.reviewType}-${c.reviewPeriod}`} variant="secondary" className="text-xs">
                      {c.reviewType.replace('_', ' ')} · {c.reviewPeriod} ({c.total})
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">{error}</p>
            )}
            {success && (
              <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">{success}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleOpen} disabled={saving || isDuplicate}>
              {saving ? 'Opening…' : 'Open Cycle'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
// suppress unused var warning for STATUS_VARIANT — kept for future use
void STATUS_VARIANT

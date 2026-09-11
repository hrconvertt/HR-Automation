'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Plus, Search, Check, Sparkles } from 'lucide-react'
import { recommendAudience } from '@/lib/policy-access'
import { PolicyList } from '@/components/policies/policy-list'

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

const AUDIENCE_OPTIONS: { role: string; label: string }[] = [
  { role: 'EMPLOYEE',  label: 'Employee' },
  { role: 'LEAD',      label: 'Lead' },
  { role: 'MANAGER',   label: 'Manager' },
  { role: 'EXECUTIVE', label: 'Executive' },
  { role: 'FINANCE',   label: 'Finance' },
]
const ALL_AUDIENCE_ROLES = AUDIENCE_OPTIONS.map((o) => o.role)

function parseAudienceRolesClient(s: string | null | undefined): string[] {
  if (!s) return [...ALL_AUDIENCE_ROLES]
  try {
    const parsed = JSON.parse(s)
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) return parsed
  } catch { /* fall through */ }
  return [...ALL_AUDIENCE_ROLES]
}

const CATEGORIES = ['ALL', 'LEAVE', 'CODE_OF_CONDUCT', 'IT', 'SECURITY', 'COMPENSATION', 'GENERAL']
const POLICY_TYPES = ['HR_POLICY', 'LEAVE_POLICY', 'CODE_OF_CONDUCT', 'NDA_TEMPLATE', 'IT_SECURITY', 'HEALTH_SAFETY', 'ANTI_HARASSMENT', 'OTHER']

const catLabels: Record<string, string> = {
  ALL: 'All categories', LEAVE: 'Leave', CODE_OF_CONDUCT: 'Code of Conduct',
  IT: 'IT', SECURITY: 'Confidentiality & Security', COMPENSATION: 'Compensation', GENERAL: 'General',
}

export default function HRPoliciesView() {
  const [policies, setPolicies] = useState<Policy[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('ALL')
  const [showArchived, setShowArchived] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // requiresAck stays in the schema/API but defaults off — signing UI is hidden.
  const blankForm = {
    title: '', type: 'HR_POLICY', category: 'GENERAL',
    description: '', content: '', url: '',
    version: '1.0', effectiveDate: '',
    audience: 'ALL', requiresAck: false,
    audienceRoles: [...ALL_AUDIENCE_ROLES] as string[],
  }
  const [form, setForm] = useState(blankForm)

  function toggleAudienceRole(role: string) {
    setForm((f) => ({
      ...f,
      audienceRoles: f.audienceRoles.includes(role)
        ? f.audienceRoles.filter((r) => r !== role)
        : [...f.audienceRoles, role],
    }))
  }

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

  function openCreate() {
    setForm(blankForm)
    setEditingId(null)
    setError('')
    setDialogOpen(true)
  }

  function openEdit(p: Policy) {
    setForm({
      title: p.title,
      type: p.type,
      category: p.category,
      description: p.description ?? '',
      content: p.content ?? '',
      url: p.url ?? '',
      version: p.version,
      effectiveDate: p.effectiveDate ? p.effectiveDate.split('T')[0] : '',
      audience: p.audience,
      requiresAck: p.requiresAck,
      audienceRoles: parseAudienceRolesClient(p.audienceRoles),
    })
    setEditingId(p.id)
    setError('')
    setDialogOpen(true)
  }

  async function handleSave() {
    setError('')
    if (!form.title.trim()) { setError('Title required'); return }
    if (form.audienceRoles.length === 0) { setError('At least one role must be selected'); return }
    setSaving(true)
    const url = editingId ? `/api/policies/${editingId}` : '/api/policies'
    const method = editingId ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error || 'Save failed'); return }
    setDialogOpen(false)
    fetchPolicies()
  }

  async function handleArchive(id: string) {
    if (!confirm('Archive this policy? It will no longer be visible to employees.')) return
    await fetch(`/api/policies/${id}`, { method: 'DELETE' })
    fetchPolicies()
  }

  const visible = policies.filter((p) => showArchived || p.status !== 'ARCHIVED')
  // "Live" = workflow ACTIVE + legacy PUBLISHED rows.
  const liveCount = policies.filter((p) => p.status === 'ACTIVE' || p.status === 'PUBLISHED').length
  const draftCount = policies.filter((p) => p.status === 'DRAFT').length

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Policies</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {liveCount} live for employees{draftCount ? ` · ${draftCount} draft${draftCount === 1 ? '' : 's'} only you can see` : ''}.
            {' '}Click <span className="font-medium text-slate-700">Open policy</span> to read one, or <span className="font-medium text-slate-700">Edit details</span> to change it.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4" /> New policy
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 flex-1 min-w-[240px] bg-white border border-slate-200 rounded-lg px-3">
          <Search className="w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search policies by name or content…"
            className="border-0 focus-visible:ring-0 px-1"
          />
        </div>
        <div className="w-56">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{catLabels[c]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Include archived policies
        </label>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-400">Loading…</div>
      ) : (
        <PolicyList
          policies={visible}
          onEdit={(id) => {
            const p = policies.find((x) => x.id === id)
            if (p) openEdit(p)
          }}
          onArchive={handleArchive}
          emptyText="No policies match this search."
        />
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Policy' : 'New Policy'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Title *</label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Category</label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.filter((c) => c !== 'ALL').map((c) => (
                      <SelectItem key={c} value={c}>{catLabels[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {POLICY_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Version</label>
                <Input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Short Description</label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Shown in policy list" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Content (markdown)</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                rows={10}
                className="w-full text-sm rounded-md border border-slate-200 px-3 py-2 font-mono"
                placeholder="# Policy heading&#10;&#10;Policy body here…"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Attachment URL (optional)</label>
              <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://drive.google.com/…" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Effective Date</label>
              <Input type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} />
            </div>

            {/* ── Per-role audience picker (Workday-style chips) ── */}
            {(() => {
              const rec = recommendAudience(form.title, form.type)
              const matchesCurrent =
                rec.audience.length === form.audienceRoles.length &&
                rec.audience.every((r) => form.audienceRoles.includes(r))
              return (
                <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <label className="block text-sm font-semibold text-slate-800">Who can see this policy?</label>
                    {form.title.trim().length > 2 && !matchesCurrent && (
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, audienceRoles: rec.audience })}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-slate-900 text-white hover:bg-slate-800"
                        title={rec.rationale}
                      >
                        <Sparkles className="w-3 h-3" /> Apply suggestion
                      </button>
                    )}
                  </div>
                  {form.title.trim().length > 2 && (
                    <p className="text-[11px] text-slate-500 italic">
                      Suggested: {rec.audience.join(' · ')} — {rec.rationale}
                    </p>
                  )}
              <div className="flex flex-wrap gap-2">
                {AUDIENCE_OPTIONS.map((opt) => {
                  const selected = form.audienceRoles.includes(opt.role)
                  return (
                    <button
                      key={opt.role}
                      type="button"
                      onClick={() => toggleAudienceRole(opt.role)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                        selected
                          ? 'bg-slate-700 text-white ring-2 ring-slate-100 shadow-sm'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                      }`}
                      aria-pressed={selected}
                    >
                      {selected && <Check className="w-3.5 h-3.5" />}
                      {opt.label}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-slate-500">
                HR always sees every policy. Pick which other roles can read it once activated.
              </p>
                  {form.audienceRoles.length === 0 && (
                    <p className="text-xs text-slate-700 font-medium">
                      At least one role must be selected.
                    </p>
                  )}
                </div>
              )
            })()}
            {/* requiresAck checkbox removed — policies are read-only references.
                Schema field stays and defaults to false. Re-enable here if signing returns. */}
            {error && <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || form.audienceRoles.length === 0}>
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create as Draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}

// CoverageDialog removed — acknowledgement UI is hidden. API endpoint
// /api/policies/[id]/coverage still exists for future use if signing returns.

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { FileText, Plus, ExternalLink, Search, Send, Archive, Edit3, Check, Eye, Sparkles } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { recommendAudience } from '@/lib/policy-access'

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
  ALL: 'All', LEAVE: 'Leave', CODE_OF_CONDUCT: 'Code of Conduct',
  IT: 'IT', SECURITY: 'Security', COMPENSATION: 'Compensation', GENERAL: 'General',
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

  const stats = {
    total: visible.length,
    // "Active" = workflow ACTIVE + legacy PUBLISHED rows.
    published: visible.filter((p) => p.status === 'ACTIVE' || p.status === 'PUBLISHED').length,
    drafts: visible.filter((p) => p.status === 'DRAFT').length,
    archived: visible.filter((p) => p.status === 'ARCHIVED').length,
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Policies</h1>
          <p className="text-gray-500 text-sm mt-0.5">Manage policy documents, categories and audiences</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" /> New Policy
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total" value={stats.total} icon={FileText} color="bg-slate-50 text-slate-700" />
        <StatCard label="Published" value={stats.published} icon={Send} color="bg-slate-50 text-slate-700" />
        <StatCard label="Drafts" value={stats.drafts} icon={Edit3} color="bg-slate-50 text-slate-700" />
        <StatCard label="Archived" value={stats.archived} icon={Archive} color="bg-slate-100 text-slate-600" />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 flex-1 min-w-[240px] bg-white border border-slate-200 rounded-lg px-3">
          <Search className="w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, description or content…"
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
        <label className="flex items-center gap-1 text-xs text-slate-600">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Audience</TableHead>
              <TableHead>Effective</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-gray-400">Loading…</TableCell>
              </TableRow>
            ) : visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-gray-400">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No policies match these filters.
                </TableCell>
              </TableRow>
            ) : visible.map((p) => {
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link href={`/dashboard/policies/${p.id}`} className="font-medium text-gray-900 hover:text-slate-700">
                      {p.title}
                    </Link>
                    {p.description && <p className="text-xs text-slate-500 mt-0.5">{p.description}</p>}
                  </TableCell>
                  <TableCell><Badge variant="secondary">{catLabels[p.category] ?? p.category}</Badge></TableCell>
                  <TableCell><StatusBadge status={p.status} /></TableCell>
                  <TableCell className="text-gray-500 text-sm">v{p.version}</TableCell>
                  <TableCell className="text-gray-600 text-sm">
                    <AudienceCell rolesJson={p.audienceRoles} />
                  </TableCell>
                  <TableCell className="text-gray-500 text-sm">{p.effectiveDate ? formatDate(p.effectiveDate) : '—'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center gap-1 justify-end">
                      {p.status === 'DRAFT' && (
                        <Link href={`/dashboard/policies/${p.id}`} title="Send for Review">
                          <Button size="sm"><Send className="w-3.5 h-3.5" /></Button>
                        </Link>
                      )}
                      {p.status === 'APPROVED' && (
                        <Link href={`/dashboard/policies/${p.id}`} title="Activate">
                          <Button size="sm" className="bg-slate-700 hover:bg-slate-700">Activate</Button>
                        </Link>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => openEdit(p)} title="Edit">
                        <Edit3 className="w-3.5 h-3.5" />
                      </Button>
                      {p.url && (
                        <a href={p.url} target="_blank" rel="noreferrer" title="Open PDF">
                          <Button size="sm" variant="ghost"><ExternalLink className="w-3.5 h-3.5" /></Button>
                        </a>
                      )}
                      {p.status !== 'ARCHIVED' && (
                        <Button size="sm" variant="ghost" onClick={() => handleArchive(p.id)} title="Archive">
                          <Archive className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>

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

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; color: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2 rounded-lg ${color}`}><Icon className="w-5 h-5" /></div>
        <div>
          <p className="text-xl font-bold">{value}</p>
          <p className="text-xs text-slate-500">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

/** Compact audience badges for the table. "Everyone" when all 5 selected; otherwise lists role labels. */
function AudienceCell({ rolesJson }: { rolesJson: string | null | undefined }) {
  const roles = parseAudienceRolesClient(rolesJson)
  const isEveryone = ALL_AUDIENCE_ROLES.every((r) => roles.includes(r)) && roles.length === ALL_AUDIENCE_ROLES.length
  if (isEveryone) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-medium">
        <Eye className="w-3 h-3" /> Everyone
      </span>
    )
  }
  const labelFor = (r: string) => AUDIENCE_OPTIONS.find((o) => o.role === r)?.label ?? r
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <span
          key={r}
          className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-50 text-slate-700 text-[11px] font-medium border border-slate-100"
        >
          {labelFor(r)}
        </span>
      ))}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  // ACTIVE (new workflow) + PUBLISHED (legacy) both render as "Active".
  if (status === 'ACTIVE' || status === 'PUBLISHED') return <Badge variant="success">Active</Badge>
  if (status === 'ARCHIVED') return <Badge variant="secondary">Archived</Badge>
  if (status === 'IN_REVIEW') return <Badge variant="warning">In Review</Badge>
  if (status === 'APPROVED') return <Badge variant="default">Approved · Awaiting HR</Badge>
  return <Badge variant="warning">Draft</Badge>
}

// CoverageDialog removed — acknowledgement UI is hidden. API endpoint
// /api/policies/[id]/coverage still exists for future use if signing returns.

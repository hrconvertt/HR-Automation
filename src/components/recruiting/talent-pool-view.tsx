'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Star, Search, Send, X, Calendar, ChevronRight } from 'lucide-react'
import { getInitials } from '@/lib/utils'

interface PoolCandidate {
  id: string
  fullName: string
  email: string
  matchScore: number | null
  experience: number | null
  currentCompany: string | null
  currentRole: string | null
  source: string | null
  poolTags: string | null
  poolReason: string | null
  poolAddedAt: string | null
  updatedAt: string
  requisition: { title: string } | null
}

interface OpenReq { id: string; title: string }

interface Props {
  candidates: PoolCandidate[]
  openRequisitions: OpenReq[]
}

const AVATAR_PALETTE = [
  'bg-purple-100 text-purple-700', 'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700', 'bg-sky-100 text-sky-700',
]
function avatarTone(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]
}

function freshness(updatedAt: string): { label: string; tone: string } {
  const days = (Date.now() - new Date(updatedAt).getTime()) / 86400_000
  if (days < 30)  return { label: 'Hot',  tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
  if (days < 180) return { label: 'Warm', tone: 'bg-amber-50 text-amber-700 border-amber-200' }
  return { label: 'Cold', tone: 'bg-slate-100 text-slate-600 border-slate-200' }
}

export function TalentPoolView({ candidates, openRequisitions }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('all')
  const [freshnessFilter, setFreshnessFilter] = useState('all')
  const [inviteTarget, setInviteTarget] = useState<PoolCandidate | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const allTags = useMemo(() => {
    const set = new Set<string>()
    candidates.forEach((c) => c.poolTags?.split(',').forEach((t) => { if (t.trim()) set.add(t.trim()) }))
    return Array.from(set).sort()
  }, [candidates])

  const filtered = useMemo(() => {
    return candidates.filter((c) => {
      if (search.trim()) {
        const q = search.toLowerCase()
        const hay = [c.fullName, c.email, c.currentCompany, c.currentRole, c.poolTags].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (tagFilter !== 'all') {
        const tags = (c.poolTags ?? '').split(',').map((t) => t.trim())
        if (!tags.includes(tagFilter)) return false
      }
      if (freshnessFilter !== 'all') {
        const f = freshness(c.updatedAt).label.toLowerCase()
        if (f !== freshnessFilter) return false
      }
      return true
    }).sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0))
  }, [candidates, search, tagFilter, freshnessFilter])

  async function removeFromPool(id: string) {
    if (!confirm('Remove this candidate from the talent pool? They stay in the system but won\'t appear here.')) return
    setRemovingId(id)
    const res = await fetch(`/api/recruiting/talent-pool/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inPool: false }),
    })
    setRemovingId(null)
    if (!res.ok) { alert('Failed to remove'); return }
    router.refresh()
  }

  return (
    <Card className="rounded-xl border-slate-200 overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-purple-50/40 to-transparent">
        <div className="flex items-center gap-2 mb-1">
          <Star className="w-4 h-4 text-purple-600" />
          <p className="text-sm font-semibold text-slate-900">Talent Pool</p>
          <span className="text-xs text-slate-500">·</span>
          <span className="text-xs text-slate-500">{candidates.length} pre-vetted candidates ready for future roles</span>
        </div>

        {/* Filter toolbar */}
        <div className="flex flex-wrap gap-2 mt-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, company, role, tags…"
              className="pl-9 bg-white" />
          </div>
          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger className="w-40 bg-white"><SelectValue placeholder="Tag" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tags</SelectItem>
              {allTags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={freshnessFilter} onValueChange={setFreshnessFilter}>
            <SelectTrigger className="w-36 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All freshness</SelectItem>
              <SelectItem value="hot">Hot (&lt;30d)</SelectItem>
              <SelectItem value="warm">Warm (&lt;6mo)</SelectItem>
              <SelectItem value="cold">Cold (6mo+)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Card grid */}
      <div className="p-4 bg-slate-50/50">
        {filtered.length === 0 ? (
          <div className="text-center py-10">
            <div className="w-12 h-12 rounded-full bg-purple-50 text-purple-400 flex items-center justify-center mx-auto mb-2">
              <Star className="w-6 h-6" />
            </div>
            <p className="text-sm text-slate-500">
              {candidates.length === 0
                ? 'No candidates in the pool yet. The pool fills automatically when strong candidates are rejected, or you can add anyone manually from their card.'
                : 'No candidates match these filters.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((c) => {
              const fresh = freshness(c.updatedAt)
              const tags = (c.poolTags ?? '').split(',').map((t) => t.trim()).filter(Boolean)
              return (
                <div key={c.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:border-purple-300 hover:shadow-md transition-all relative group">
                  <button
                    type="button"
                    onClick={() => removeFromPool(c.id)}
                    disabled={removingId === c.id}
                    className="absolute top-2 right-2 p-1 rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition"
                    title="Remove from pool"
                  >
                    <X className="w-3 h-3" />
                  </button>

                  <div className="flex items-start gap-3">
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${avatarTone(c.fullName)}`}>
                      {getInitials(c.fullName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-slate-900 text-sm leading-tight truncate">{c.fullName}</p>
                        <Star className="w-2.5 h-2.5 text-purple-500 fill-purple-500 flex-shrink-0" />
                      </div>
                      {c.currentRole && (
                        <p className="text-xs text-slate-600 mt-0.5 truncate">{c.currentRole}{c.currentCompany ? ` · ${c.currentCompany}` : ''}</p>
                      )}
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className={`inline-flex items-center text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${fresh.tone}`}>
                          {fresh.label}
                        </span>
                        {c.matchScore != null && (
                          <span className="text-[10px] text-slate-500 tabular-nums">Score {Math.round(c.matchScore)}</span>
                        )}
                        {c.experience != null && (
                          <>
                            <span className="text-slate-300">·</span>
                            <span className="text-[10px] text-slate-500">{c.experience}y exp</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {tags.slice(0, 4).map((t) => (
                        <span key={t} className="text-[10px] font-medium text-slate-600 bg-slate-100 rounded px-1.5 py-0.5">{t}</span>
                      ))}
                    </div>
                  )}

                  {c.poolReason && (
                    <p className="text-[11px] text-slate-500 mt-2 line-clamp-2">{c.poolReason}</p>
                  )}

                  <Button
                    size="sm"
                    onClick={() => setInviteTarget(c)}
                    disabled={openRequisitions.length === 0}
                    className="w-full mt-3 h-8 text-xs"
                  >
                    <Send className="w-3 h-3 mr-1.5" />
                    {openRequisitions.length === 0 ? 'No open roles' : 'Invite to active role'}
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <InviteDialog target={inviteTarget} openRequisitions={openRequisitions} onClose={() => setInviteTarget(null)} />
    </Card>
  )
}

function InviteDialog({ target, openRequisitions, onClose }: {
  target: PoolCandidate | null
  openRequisitions: OpenReq[]
  onClose: () => void
}) {
  const router = useRouter()
  const [reqId, setReqId] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (!target) return
    setError('')
    if (!reqId) { setError('Pick a role to invite them to'); return }
    setSaving(true)
    const res = await fetch(`/api/recruiting/talent-pool/${target.id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requisitionId: reqId, message }),
    })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error || 'Failed')
      return
    }
    setReqId(''); setMessage('')
    onClose()
    router.refresh()
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5 text-purple-600" /> Invite to Active Role
          </DialogTitle>
        </DialogHeader>
        {target && (
          <div className="space-y-3 text-sm">
            <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">
              <span className="font-medium text-slate-900">{target.fullName}</span>
              {target.requisition && (
                <>
                  <span className="text-slate-400 mx-1.5">·</span>
                  <span>Previously applied for {target.requisition.title}</span>
                </>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Invite to *</label>
              <Select value={reqId} onValueChange={setReqId}>
                <SelectTrigger><SelectValue placeholder="Pick an open role" /></SelectTrigger>
                <SelectContent>
                  {openRequisitions.map((r) => <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Personal note <span className="text-slate-400 font-normal normal-case">(optional)</span>
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                placeholder="e.g. We thought of you when this role opened — your eCom design background is a great fit."
                className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
              />
            </div>
            <div className="rounded-md bg-purple-50 border border-purple-100 text-xs text-purple-900 px-3 py-2 flex items-start gap-2">
              <Calendar className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>
                On save: {target.fullName.split(' ')[0]} moves to the <strong>INTERVIEW</strong> stage on the new role (skipping APPLIED since they&apos;re pre-vetted), and a re-engagement email is drafted in the Email Queue for your review.
              </span>
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !reqId} className="bg-purple-600 hover:bg-purple-700">
            {saving ? 'Inviting…' : <><Send className="w-3.5 h-3.5 mr-1.5" /> Invite & Draft Email</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

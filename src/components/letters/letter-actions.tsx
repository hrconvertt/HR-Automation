'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Check, X, Printer, Trash2, CheckCircle2 } from 'lucide-react'

interface Props {
  letterId: string
  status: string
  role: 'HR_ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'EXECUTIVE'
  canDelete: boolean
  isPreviewMode: boolean
}

export function LetterActions({ letterId, status, role, canDelete, isPreviewMode }: Props) {
  const router = useRouter()
  const [approveOpen, setApproveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [signedByName, setSignedByName] = useState('')
  const [signedByTitle, setSignedByTitle] = useState('HR Manager')
  const [rejectionReason, setRejectionReason] = useState('')

  async function patch(body: Record<string, unknown>) {
    setSaving(true)
    setError('')
    const res = await fetch(`/api/letters/${letterId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      setError(data.error || 'Action failed')
      return false
    }
    setApproveOpen(false)
    setRejectOpen(false)
    router.refresh()
    return true
  }

  async function handleDelete() {
    if (!confirm('Delete this letter request? This cannot be undone.')) return
    setSaving(true)
    const res = await fetch(`/api/letters/${letterId}`, { method: 'DELETE' })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error || 'Failed to delete')
      return
    }
    router.refresh()
  }

  const isHR = role === 'HR_ADMIN'
  const hrCanAct = isHR && !isPreviewMode

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* HR approve / reject — only when PENDING */}
      {hrCanAct && status === 'PENDING' && (
        <>
          <Button size="sm" variant="success" onClick={() => setApproveOpen(true)} disabled={saving}>
            <Check className="w-3.5 h-3.5" /> Approve
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setRejectOpen(true)} disabled={saving}>
            <X className="w-3.5 h-3.5" /> Reject
          </Button>
        </>
      )}

      {/* HR mark as generated */}
      {hrCanAct && status === 'APPROVED' && (
        <Button size="sm" variant="secondary" onClick={() => patch({ action: 'MARK_GENERATED' })} disabled={saving}>
          <CheckCircle2 className="w-3.5 h-3.5" /> Mark Generated
        </Button>
      )}

      {/* Print — available once APPROVED for the employee or HR */}
      {(status === 'APPROVED' || status === 'GENERATED') && (
        <Link href={`/letters/${letterId}/print`} target="_blank">
          <Button size="sm" variant="outline">
            <Printer className="w-3.5 h-3.5" /> Print
          </Button>
        </Link>
      )}

      {/* Delete */}
      {canDelete && (
        <Button size="sm" variant="ghost" onClick={handleDelete} disabled={saving} title="Delete">
          <Trash2 className="w-3.5 h-3.5 text-slate-500" />
        </Button>
      )}

      {/* Approve dialog */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve & Generate Letter</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              The letter content will be generated automatically using a template. A unique letter number (CON-LTR-YYYY-NNN) is assigned on approval.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Signed by (name)</label>
              <Input
                placeholder="e.g. Tahreem Asif"
                value={signedByName}
                onChange={(e) => setSignedByName(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">Leave blank to use your name on record.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Signed by (title)</label>
              <Input
                placeholder="e.g. HR Manager"
                value={signedByTitle}
                onChange={(e) => setSignedByTitle(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)} disabled={saving}>Cancel</Button>
            <Button
              variant="success"
              onClick={() => patch({ action: 'APPROVE', signedByName, signedByTitle })}
              disabled={saving}
            >
              {saving ? 'Approving…' : 'Approve & Generate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Letter Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
              <Input
                placeholder="e.g. Probation period not yet completed."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={saving}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => patch({ action: 'REJECT', rejectionReason })}
              disabled={saving || !rejectionReason.trim()}
            >
              {saving ? 'Rejecting…' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

'use client'

/**
 * "Request documents" — asks a new joiner for their onboarding papers.
 *
 * Opens a dialog with the request email already written, listing what is still
 * outstanding for this person. HR copies it or opens it in their own mailbox —
 * nothing is sent from here and no address is invented, so HR always chooses
 * who it goes to.
 *
 * Pressing the button also records that the ask went out (documentsRequestedAt),
 * so the onboarding workspace can show it was requested.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { FileText, Copy, Check, Mail, Loader2 } from 'lucide-react'

interface Props {
  employeeId: string
  /** Optional recipient, to prefill the mail link when HR has it. */
  toEmail?: string | null
  /** Style: the primary onboarding action, or a quieter secondary. */
  variant?: 'default' | 'outline'
  size?: 'sm' | 'default'
  label?: string
}

interface Built { subject: string; body: string; docs: { documentType: string; label: string }[] }

export function RequestDocumentsButton({
  employeeId, toEmail, variant = 'outline', size = 'sm', label = 'Request documents',
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [built, setBuilt] = useState<Built | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function openDialog() {
    setOpen(true); setLoading(true); setErr(null); setBuilt(null)
    // POST records the ask and returns the email in one go.
    const res = await fetch(`/api/onboarding/${employeeId}/request-documents`, { method: 'POST' })
    const d = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) { setErr(d.error ?? 'Could not build the request.'); return }
    setBuilt(d)
    router.refresh()
  }

  function copy() {
    if (!built) return
    navigator.clipboard.writeText(`${built.subject}\n\n${built.body}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  function openInMail() {
    if (!built) return
    const to = toEmail ? encodeURIComponent(toEmail) : ''
    window.location.href =
      `mailto:${to}?subject=${encodeURIComponent(built.subject)}&body=${encodeURIComponent(built.body)}`
  }

  return (
    <>
      <Button variant={variant} size={size} onClick={openDialog}>
        <FileText className="w-3.5 h-3.5 mr-1.5" /> {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Request onboarding documents</DialogTitle></DialogHeader>

          {loading ? (
            <p className="text-sm text-slate-400 flex items-center gap-2 py-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Building the request…
            </p>
          ) : err ? (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{err}</p>
          ) : built ? (
            <div className="space-y-3">
              {built.docs.length > 0 ? (
                <p className="text-[11px] text-slate-500">
                  Asking for {built.docs.length} outstanding{' '}
                  {built.docs.length === 1 ? 'document' : 'documents'}. Copy this, or open it in
                  your mail — you choose the recipient.
                </p>
              ) : (
                <p className="text-[11px] text-emerald-700">
                  Everything is already on file, so this is a short thank-you rather than a request.
                </p>
              )}
              <p className="text-[11px] text-slate-500">
                <span className="font-semibold uppercase tracking-wide">Subject</span> · {built.subject}
              </p>
              <textarea
                readOnly
                rows={14}
                value={built.body}
                className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm font-mono leading-relaxed"
              />
              <p className="text-[11px] text-slate-400">
                Nothing is sent from here — the request is recorded, and you send it from your own
                mailbox.
              </p>
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
            {built && (
              <>
                <Button variant="outline" onClick={copy}>
                  {copied ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
                <Button onClick={openInMail}>
                  <Mail className="w-3.5 h-3.5 mr-1.5" /> Open in mail
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

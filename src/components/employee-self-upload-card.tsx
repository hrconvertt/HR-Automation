'use client'

/**
 * EmployeeSelfUploadCard — renders the 5 employee-provided documents
 * (CNIC, Photo, Address Proof, Education Certificate, Experience Letter)
 * with a per-row upload widget.
 *
 * Permissions are enforced server-side (POST /api/documents allows self).
 * Rendered ONLY on the employee's own profile.
 *
 * After upload:
 *   • the row flips to "Uploaded on <date>"
 *   • the matching OnboardingTask flips to DONE (server-side via the POST
 *     handler in /api/documents)
 */

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Upload, ShieldCheck, AlertCircle } from 'lucide-react'
import { EMPLOYEE_UPLOADABLE_DOC_TYPES, EMPLOYEE_UPLOADABLE_DOC_LABEL, type EmployeeUploadableDocType } from '@/lib/onboarding-tasks'

interface ExistingDoc {
  id: string
  type: string
  createdAt: string
  visibleToEmployee?: boolean
  signedAt?: string | null
}

interface Props {
  employeeId: string
  documents: ExistingDoc[]
}

const ACCEPTED = '.pdf,.jpg,.jpeg,.png'
const MAX_MB = 5

function fmt(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function EmployeeSelfUploadCard({ employeeId, documents }: Props) {
  const router = useRouter()

  // Latest doc per uploadable type
  const latestByType: Partial<Record<EmployeeUploadableDocType, ExistingDoc>> = {}
  for (const d of documents) {
    if (EMPLOYEE_UPLOADABLE_DOC_TYPES.includes(d.type as EmployeeUploadableDocType)) {
      const t = d.type as EmployeeUploadableDocType
      const existing = latestByType[t]
      if (!existing || new Date(d.createdAt) > new Date(existing.createdAt)) {
        latestByType[t] = d
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-blue-600" />
          Upload your documents
        </CardTitle>
        <p className="text-xs text-slate-500 mt-1">
          Upload these documents to complete your onboarding. PDF / JPG / PNG · max {MAX_MB} MB each.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {EMPLOYEE_UPLOADABLE_DOC_TYPES.map((type) => (
          <UploadRow
            key={type}
            type={type}
            label={EMPLOYEE_UPLOADABLE_DOC_LABEL[type]}
            existing={latestByType[type]}
            employeeId={employeeId}
            onUploaded={() => router.refresh()}
          />
        ))}
      </CardContent>
    </Card>
  )
}

function UploadRow({
  type, label, existing, employeeId, onUploaded,
}: {
  type: EmployeeUploadableDocType
  label: string
  existing: ExistingDoc | undefined
  employeeId: string
  onUploaded: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleFile(file: File) {
    setErr(null)
    if (file.size > MAX_MB * 1024 * 1024) {
      setErr(`File exceeds ${MAX_MB} MB.`)
      return
    }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('type', type)
      fd.append('employeeId', employeeId)
      fd.append('name', file.name)
      const res = await fetch('/api/documents', { method: 'POST', body: fd })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Upload failed')
      }
      onUploaded()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const isVerified = !!existing?.signedAt
  const uploaded = !!existing

  return (
    <div className="flex items-center gap-3 border border-slate-200 rounded-lg p-3 bg-white">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900">{label}</p>
        {uploaded ? (
          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Uploaded on {fmt(existing!.createdAt)}
            {isVerified && <span className="ml-2 text-emerald-700 font-medium">· Verified by HR</span>}
          </p>
        ) : (
          <p className="text-xs text-slate-400 mt-0.5">Not uploaded</p>
        )}
        {err && (
          <p className="text-xs text-rose-600 mt-1 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {err}
          </p>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
        }}
      />
      <Button
        type="button"
        variant={uploaded ? 'outline' : 'default'}
        size="sm"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="w-3.5 h-3.5 mr-1.5" />
        {busy ? 'Uploading…' : uploaded ? 'Re-upload' : 'Upload'}
      </Button>
    </div>
  )
}

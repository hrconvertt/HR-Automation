'use client'

/**
 * The employee's avatar, clickable like LinkedIn's.
 *
 * Clicking opens a viewer with the picture shown large. Anyone who may edit it
 * — HR, or the employee themselves — also gets Change and Remove there, so
 * viewing and editing live behind the same click instead of a hidden hover
 * control. People without a photo show their initials, and the same click opens
 * the uploader.
 */

import { useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Trash2, X, Loader2, AlertTriangle } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'

export default function ProfilePhotoAvatar({
  employeeId, fullName, photoUrl, canEdit,
}: {
  employeeId: string
  fullName: string
  photoUrl: string | null
  canEdit: boolean
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [src, setSrc] = useState(photoUrl)
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const close = useCallback(() => {
    if (busy) return
    setOpen(false)
    setError(null)
  }, [busy])

  async function upload(file: File) {
    setBusy('upload')
    setError(null)
    const body = new FormData()
    body.append('file', file)
    const res = await fetch(`/api/employees/${employeeId}/photo`, { method: 'POST', body })
    const j = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { setError(j.error ?? 'Could not upload that image.'); return }
    setSrc(j.photoUrl)
    router.refresh()
  }

  async function remove() {
    setBusy('remove')
    setError(null)
    const res = await fetch(`/api/employees/${employeeId}/photo`, { method: 'DELETE' })
    const j = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { setError(j.error ?? 'Could not remove the photo.'); return }
    setSrc(null)
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={canEdit ? 'View or change profile photo' : 'View profile photo'}
        aria-label={`Profile photo of ${fullName}`}
        className="group relative rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
      >
        <Avatar name={fullName} src={src} size="lg" className="w-16 h-16 text-lg" />
        {canEdit && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity">
            <Camera className="w-5 h-5 text-white" />
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Profile photo of ${fullName}`}
          onClick={close}
          onKeyDown={(e) => { if (e.key === 'Escape') close() }}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900">{fullName}</h2>
              <button
                onClick={close}
                disabled={!!busy}
                aria-label="Close"
                className="text-slate-400 hover:text-slate-900 disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-center bg-slate-50 p-6">
              {src ? (
                // Plain <img>: the bytes come from our own API route at an
                // unknown intrinsic size, which next/image can't optimise.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={src}
                  alt={fullName}
                  className="w-56 h-56 rounded-full object-cover shadow-sm"
                />
              ) : (
                <div className="w-56 h-56 rounded-full bg-slate-700 text-white flex items-center justify-center text-5xl font-semibold">
                  {getInitials(fullName)}
                </div>
              )}
            </div>

            {error && (
              <p className="flex items-start gap-2 px-5 pt-3 text-xs text-red-700">
                <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
                <span>{error}</span>
              </p>
            )}

            {canEdit && (
              <div className="flex items-center justify-end gap-2 px-5 py-4">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    // Reset so picking the same file twice still fires onChange.
                    e.target.value = ''
                    if (f) upload(f)
                  }}
                />
                {src && (
                  <button
                    onClick={remove}
                    disabled={!!busy}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 text-slate-700 text-xs px-3 py-2 disabled:opacity-50"
                  >
                    {busy === 'remove'
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Trash2 className="w-3.5 h-3.5" />}
                    Remove photo
                  </button>
                )}
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={!!busy}
                  className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 text-white text-xs px-3 py-2 disabled:opacity-50"
                >
                  {busy === 'upload'
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Camera className="w-3.5 h-3.5" />}
                  {src ? 'Change photo' : 'Add photo'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

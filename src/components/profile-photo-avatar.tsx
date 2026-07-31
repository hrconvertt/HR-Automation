'use client'

/**
 * Profile photo, modelled on LinkedIn's.
 *
 * Clicking the avatar opens a viewer: the picture large and circular, a
 * visibility note, and an action row of Edit / Update / Delete for anyone
 * allowed to change it — HR, or the employee themselves. Everyone else gets
 * the viewer alone.
 *
 * "Edit" is a real crop step, not a relabelled upload. Without it a photo whose
 * subject sits off-centre is CSS-cropped to a circle and comes out with the
 * face half out of frame, and the only fix would be re-cropping the file by
 * hand before uploading. Drag to reposition, slider to zoom; the result is
 * drawn to a square canvas and uploaded, so what is stored already matches
 * what was previewed.
 *
 * LinkedIn's fourth action, Frames, is a decorative overlay ("#OpenToWork")
 * with no equivalent here, so it is deliberately absent rather than stubbed.
 */

import { useRef, useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Trash2, X, Loader2, AlertTriangle, Pencil, Eye, Check } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'

/** Side of the circular crop viewport, in CSS px. */
const VIEW = 288
/** Side of the stored image. Square, so every avatar crops predictably. */
const OUT = 512

type Mode = 'view' | 'edit'

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
  const [mode, setMode] = useState<Mode>('view')
  const [src, setSrc] = useState(photoUrl)
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Crop state. `editSrc` is an object URL for a newly picked file, or the
  // stored photo when re-cropping what is already there.
  const [editSrc, setEditSrc] = useState<string | null>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  // Revoke object URLs so picking several photos in a row doesn't leak them.
  useEffect(() => () => { if (editSrc?.startsWith('blob:')) URL.revokeObjectURL(editSrc) }, [editSrc])

  const close = useCallback(() => {
    if (busy) return
    setOpen(false)
    setMode('view')
    setEditSrc(null)
    setImg(null)
    setError(null)
  }, [busy])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  /** Scale that makes the image just cover the viewport, before zoom. */
  const baseScale = img ? Math.max(VIEW / img.naturalWidth, VIEW / img.naturalHeight) : 1
  const scale = baseScale * zoom
  const drawW = img ? img.naturalWidth * scale : 0
  const drawH = img ? img.naturalHeight * scale : 0
  const left = (VIEW - drawW) / 2 + offset.x
  const top = (VIEW - drawH) / 2 + offset.y

  /** Keep the image covering the circle — no empty wedges at the edges. */
  const clamp = useCallback((o: { x: number; y: number }, w: number, h: number) => {
    const mx = Math.max(0, (w - VIEW) / 2)
    const my = Math.max(0, (h - VIEW) / 2)
    return {
      x: Math.min(mx, Math.max(-mx, o.x)),
      y: Math.min(my, Math.max(-my, o.y)),
    }
  }, [])

  useEffect(() => {
    if (img) setOffset((o) => clamp(o, drawW, drawH))
  }, [img, drawW, drawH, clamp])

  function startEdit(source: string) {
    setError(null)
    const image = new Image()
    // Same-origin (our own photo route or a blob URL), so the canvas the crop
    // is drawn to stays untainted and toBlob() works.
    image.onload = () => {
      setImg(image)
      setZoom(1)
      setOffset({ x: 0, y: 0 })
      setMode('edit')
    }
    image.onerror = () => setError('That image could not be opened.')
    image.src = source
    setEditSrc(source)
  }

  function pickFile(f: File) {
    if (!f.type.startsWith('image/')) { setError('Choose an image file.'); return }
    startEdit(URL.createObjectURL(f))
  }

  async function saveCrop() {
    if (!img || busy) return
    setBusy('save')
    setError(null)

    const canvas = document.createElement('canvas')
    canvas.width = OUT
    canvas.height = OUT
    const ctx = canvas.getContext('2d')
    if (!ctx) { setBusy(null); setError('Could not process the image.'); return }
    // The viewport is VIEW px on screen and OUT px stored, so every coordinate
    // scales by the same ratio and the saved crop matches the preview exactly.
    const r = OUT / VIEW
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, OUT, OUT)
    ctx.drawImage(img, left * r, top * r, drawW * r, drawH * r)

    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.92))
    if (!blob) { setBusy(null); setError('Could not process the image.'); return }

    const body = new FormData()
    body.append('file', new File([blob], 'profile.jpg', { type: 'image/jpeg' }))
    const res = await fetch(`/api/employees/${employeeId}/photo`, { method: 'POST', body })
    const j = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { setError(j.error ?? 'Could not save the photo.'); return }

    setSrc(j.photoUrl)
    setMode('view')
    setEditSrc(null)
    setImg(null)
    router.refresh()
  }

  async function remove() {
    if (busy) return
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Profile photo"
          onClick={close}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">
                {mode === 'edit' ? 'Edit photo' : 'Profile photo'}
              </h2>
              <button
                onClick={close}
                disabled={!!busy}
                aria-label="Close"
                className="text-slate-400 hover:text-slate-900 disabled:opacity-40"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = '' // so re-picking the same file still fires
                if (f) pickFile(f)
              }}
            />

            {mode === 'view' ? (
              <>
                <div className="flex items-center justify-center px-6 pt-8 pb-6">
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={src}
                      alt={fullName}
                      style={{ width: VIEW, height: VIEW }}
                      className="rounded-full object-cover bg-slate-100"
                    />
                  ) : (
                    <div
                      style={{ width: VIEW, height: VIEW }}
                      className="rounded-full bg-slate-700 text-white flex items-center justify-center text-6xl font-semibold"
                    >
                      {getInitials(fullName)}
                    </div>
                  )}
                </div>

                <div className="px-5">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-3 py-1.5 text-xs text-slate-700">
                    <Eye className="w-3.5 h-3.5" /> Everyone at Convertt
                  </span>
                </div>

                {error && (
                  <p className="flex items-start gap-2 px-5 pt-3 text-xs text-red-700">
                    <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
                    <span>{error}</span>
                  </p>
                )}

                {canEdit && (
                  <div className="flex items-end justify-between px-5 py-5 mt-2">
                    <div className="flex items-end gap-6">
                      <IconAction
                        icon={Pencil}
                        label="Edit"
                        disabled={!src || !!busy}
                        title={src ? 'Reposition and zoom' : 'No photo to edit yet'}
                        onClick={() => src && startEdit(src)}
                      />
                      <IconAction
                        icon={Camera}
                        label="Update"
                        disabled={!!busy}
                        title="Choose a new photo"
                        onClick={() => fileRef.current?.click()}
                      />
                    </div>
                    {src && (
                      <IconAction
                        icon={busy === 'remove' ? Loader2 : Trash2}
                        label="Delete"
                        spin={busy === 'remove'}
                        disabled={!!busy}
                        title="Remove the photo"
                        onClick={remove}
                      />
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex flex-col items-center px-6 pt-6 pb-2">
                  <div
                    style={{ width: VIEW, height: VIEW }}
                    className="relative rounded-full overflow-hidden bg-slate-100 cursor-grab active:cursor-grabbing touch-none select-none"
                    onPointerDown={(e) => {
                      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
                      drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
                    }}
                    onPointerMove={(e) => {
                      const d = drag.current
                      if (!d) return
                      setOffset(clamp(
                        { x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) },
                        drawW, drawH,
                      ))
                    }}
                    onPointerUp={() => { drag.current = null }}
                    onPointerCancel={() => { drag.current = null }}
                  >
                    {img && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={editSrc ?? ''}
                        alt=""
                        draggable={false}
                        style={{ position: 'absolute', left, top, width: drawW, height: drawH, maxWidth: 'none' }}
                      />
                    )}
                  </div>

                  <label className="w-full max-w-xs mt-5 flex items-center gap-3">
                    <span className="text-xs text-slate-500 shrink-0">Zoom</span>
                    <input
                      type="range"
                      min={1}
                      max={3}
                      step={0.01}
                      value={zoom}
                      onChange={(e) => setZoom(Number(e.target.value))}
                      className="w-full accent-slate-900"
                      aria-label="Zoom"
                    />
                  </label>
                  <p className="text-[11px] text-slate-500 mt-2">Drag the photo to reposition it.</p>
                </div>

                {error && (
                  <p className="flex items-start gap-2 px-5 pt-1 text-xs text-red-700">
                    <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
                    <span>{error}</span>
                  </p>
                )}

                <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 mt-3">
                  <button
                    onClick={() => { setMode('view'); setEditSrc(null); setImg(null); setError(null) }}
                    disabled={!!busy}
                    className="rounded-md border border-slate-300 text-slate-700 text-xs px-3 py-2 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveCrop}
                    disabled={!!busy || !img}
                    className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 text-white text-xs px-3 py-2 disabled:opacity-50"
                  >
                    {busy === 'save'
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Check className="w-3.5 h-3.5" />}
                    Save photo
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

/** LinkedIn's action style: icon above a small label. */
function IconAction({
  icon: Icon, label, onClick, disabled, title, spin,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  disabled?: boolean
  title?: string
  spin?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex flex-col items-center gap-1.5 text-slate-700 hover:text-slate-900 disabled:opacity-35 disabled:hover:text-slate-700"
    >
      <Icon className={`w-5 h-5 ${spin ? 'animate-spin' : ''}`} />
      <span className="text-xs">{label}</span>
    </button>
  )
}

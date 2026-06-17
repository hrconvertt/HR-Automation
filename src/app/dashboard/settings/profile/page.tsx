'use client'

/**
 * /dashboard/settings/profile
 * Profile editor — display name, photo (BYTEA / base64), pronouns.
 */
import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import SettingsSidebar from '@/components/settings-sidebar'

export default function ProfilePage() {
  const [role, setRole] = useState<string | undefined>()
  const [fullName, setFullName] = useState('')
  const [pronouns, setPronouns] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoBase64, setPhotoBase64] = useState<string | null>(null)
  const [photoMime, setPhotoMime] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/profile').then((r) => r.json()).then((d) => {
      if (d.user) {
        setRole(d.user.role)
        setFullName(d.user.employee?.fullName ?? '')
        setPronouns(d.user.pronouns ?? '')
        setPhotoUrl(d.user.employee?.photoUrl ?? null)
      }
    }).catch(() => {})
  }, [])

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setPhotoUrl(result)
      const match = result.match(/^data:([^;]+);base64,(.+)$/)
      if (match) { setPhotoMime(match[1]); setPhotoBase64(match[2]) }
    }
    reader.readAsDataURL(file)
  }

  async function save() {
    setSaving(true)
    try {
      const body: Record<string, unknown> = { fullName, pronouns }
      if (photoBase64 && photoMime) {
        body.photoBase64 = photoBase64
        body.photoMimeType = photoMime
      }
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500) }
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Profile</h1>
        <p className="text-sm text-slate-500 mt-1">How you appear across Convertt HR — visible to your team.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px,1fr] gap-6">
        <SettingsSidebar role={role} />

        <div className="min-w-0">
          <Card>
            <CardHeader className="border-b border-slate-100"><CardTitle>Profile details</CardTitle></CardHeader>
            <CardContent className="p-6 space-y-5 max-w-xl">
              <div className="flex items-center gap-4">
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl} alt="Profile" className="w-20 h-20 rounded-full object-cover ring-2 ring-slate-200" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-2xl font-bold">
                    {(fullName || 'U').slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium text-slate-700 hover:underline cursor-pointer">
                    Upload new photo
                    <input type="file" accept="image/*" onChange={onFile} className="hidden" />
                  </label>
                  <p className="text-xs text-slate-500 mt-1">PNG, JPG or GIF · Max ~2 MB</p>
                </div>
              </div>

              <Field label="Display name">
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </Field>
              <Field label="Pronouns" hint="Optional — e.g. she/her, he/him, they/them">
                <Input value={pronouns} onChange={(e) => setPronouns(e.target.value)} placeholder="she/her" />
              </Field>

              <Button onClick={save} disabled={saving}>{saved ? '✓ Saved' : saving ? 'Saving…' : 'Save profile'}</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}

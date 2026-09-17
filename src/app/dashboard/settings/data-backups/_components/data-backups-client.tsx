'use client'

/**
 * Data backups: the list of fortnightly backups on the left, the chosen
 * backup's folders and CSV files on the right. The one button that matters
 * — "Download all (.zip)" — sits at the top of the chosen backup; single
 * files each have their own "Download CSV".
 */

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Download, FileSpreadsheet, FolderOpen, Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toastSuccess, toast } from '@/components/ui/toaster'
import { cn } from '@/lib/utils'

interface BackupFile {
  id: string
  folder: string
  dataset: string
  label: string
  fileName: string
  rowCount: number
  sizeBytes: number
  downloadedAt: string | null
}
interface Backup {
  id: string
  trigger: 'SCHEDULED' | 'MANUAL'
  createdByName: string | null
  fileCount: number
  rowCount: number
  sizeBytes: number
  downloadedAt: string | null
  downloadedByName: string | null
  createdAt: string
  files: BackupFile[]
}
interface Payload { nextDueAt: string; backups: Backup[] }

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' })
const fmtDateTime = (s: string) =>
  new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Karachi' })
const fmtSize = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`)
const fmtRows = (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'row' : 'rows'}`

export function DataBackupsClient({ canDelete }: { canDelete: boolean }) {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/data-backups', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not load backups.')
      setData(json)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load backups.')
    }
  }, [])

  useEffect(() => { load() }, [load])

  const backups = data?.backups ?? []
  const selected = backups.find((b) => b.id === selectedId) ?? backups[0] ?? null

  // A download is a plain link, so the browser saves the file; re-read the
  // list shortly after so "Not downloaded yet" turns into "Downloaded".
  const afterDownload = () => setTimeout(load, 2500)

  async function backUpNow() {
    setCreating(true)
    try {
      const res = await fetch('/api/data-backups', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'The backup could not be made.')
      setSelectedId(json.backup.id)
      await load()
      toastSuccess('Backup made', `${json.backup.fileCount} CSV files are ready to download.`)
    } catch (e) {
      toast({ title: 'Backup failed', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally {
      setCreating(false)
    }
  }

  async function deleteBackup(b: Backup) {
    const typed = window.prompt(
      `Delete the backup from ${fmtDate(b.createdAt)} and its ${b.fileCount} files for good?\n\nYour live data is not affected. Type DELETE to confirm.`,
    )
    if (typed !== 'DELETE') return
    setDeleting(true)
    try {
      const res = await fetch(`/api/data-backups/${b.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not delete the backup.')
      setSelectedId(null)
      await load()
      toastSuccess('Backup deleted')
    } catch (e) {
      toast({ title: 'Delete failed', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  if (error) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
  }
  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading backups…
      </div>
    )
  }

  const latest = backups[0]
  const folders = selected
    ? selected.files.reduce<{ name: string; files: BackupFile[] }[]>((acc, f) => {
        const last = acc[acc.length - 1]
        if (last && last.name === f.folder) last.files.push(f)
        else acc.push({ name: f.folder, files: [f] })
        return acc
      }, [])
    : []

  return (
    <div className="space-y-4">
      {/* Status */}
      <div
        className={cn(
          'flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between',
          latest && !latest.downloadedAt ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white',
        )}
      >
        <div className="text-sm">
          {!latest && (
            <p className="font-medium text-slate-900">No backups yet. Make the first one now.</p>
          )}
          {latest && !latest.downloadedAt && (
            <p className="flex items-center gap-1.5 font-medium text-amber-900">
              <AlertTriangle className="h-4 w-4" />
              The backup from {fmtDate(latest.createdAt)} has not been downloaded yet.
            </p>
          )}
          {latest?.downloadedAt && (
            <p className="flex items-center gap-1.5 font-medium text-slate-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Latest backup ({fmtDate(latest.createdAt)}) downloaded by {latest.downloadedByName ?? 'HR'} on {fmtDateTime(latest.downloadedAt)}.
            </p>
          )}
          <p className="mt-0.5 text-slate-600">
            Next automatic backup: <span className="font-medium">{fmtDate(data.nextDueAt)}</span>. You get a
            notification when it is ready, and a reminder every 3 days until it is downloaded.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {latest && !latest.downloadedAt && (
            <a href={`/api/data-backups/${latest.id}/zip`} onClick={afterDownload}>
              <Button><Download className="h-4 w-4" /> Download latest (.zip)</Button>
            </a>
          )}
          <Button variant="outline" onClick={backUpNow} disabled={creating}>
            {creating ? <><Loader2 className="h-4 w-4 animate-spin" /> Making backup…</> : 'Back up now'}
          </Button>
        </div>
      </div>

      {backups.length > 0 && selected && (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          {/* Backups */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <p className="border-b border-slate-200 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Backups ({backups.length})
            </p>
            <ul className="max-h-[560px] overflow-y-auto">
              {backups.map((b) => (
                <li key={b.id}>
                  <button
                    onClick={() => setSelectedId(b.id)}
                    className={cn(
                      'w-full border-b border-slate-100 px-4 py-3 text-left last:border-0 hover:bg-slate-50',
                      b.id === selected.id && 'bg-slate-100',
                    )}
                  >
                    <p className="text-sm font-medium text-slate-900">{fmtDate(b.createdAt)}</p>
                    <p className="text-xs text-slate-500">
                      {b.trigger === 'SCHEDULED' ? 'Automatic' : `Made by ${b.createdByName ?? 'HR'}`} · {b.fileCount} files · {fmtSize(b.sizeBytes)}
                    </p>
                    <p className={cn('mt-0.5 text-xs', b.downloadedAt ? 'text-emerald-700' : 'text-amber-700')}>
                      {b.downloadedAt ? 'Downloaded' : 'Not downloaded yet'}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Chosen backup */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-slate-900">Backup of {fmtDateTime(selected.createdAt)}</p>
                <p className="text-xs text-slate-500">
                  {folders.length} folders · {selected.fileCount} CSV files · {fmtRows(selected.rowCount)} · {fmtSize(selected.sizeBytes)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <a href={`/api/data-backups/${selected.id}/zip`} onClick={afterDownload}>
                  <Button><Download className="h-4 w-4" /> Download all (.zip)</Button>
                </a>
                {canDelete && (
                  <Button variant="ghost" onClick={() => deleteBackup(selected)} disabled={deleting}>
                    {deleting ? 'Deleting…' : 'Delete backup'}
                  </Button>
                )}
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {folders.map((folder) => (
                <section key={folder.name} className="px-4 py-3">
                  <h2 className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <FolderOpen className="h-4 w-4 text-slate-500" />
                    {folder.name}
                    <span className="font-normal text-slate-400">({folder.files.length})</span>
                  </h2>
                  <ul>
                    {folder.files.map((f) => (
                      <li key={f.id} className="flex items-center gap-3 rounded-md py-1.5 pl-6 pr-1 hover:bg-slate-50">
                        <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-slate-900">{f.label}</p>
                          <p className="text-xs text-slate-500">
                            {f.fileName} · {fmtRows(f.rowCount)} · {fmtSize(f.sizeBytes)}
                          </p>
                        </div>
                        <a href={`/api/data-backups/${selected.id}/files/${f.id}`} onClick={afterDownload}>
                          <Button variant="outline" size="sm"><Download className="h-3.5 w-3.5" /> Download CSV</Button>
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

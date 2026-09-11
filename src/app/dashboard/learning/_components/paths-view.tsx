'use client'

/**
 * My Learning Paths — your own paths, then the ones other people share with
 * everyone. A path's cover is its contents: the first three courses' covers
 * side by side.
 */

import Link from 'next/link'
import { FolderPlus, Lock, Globe, Plus } from 'lucide-react'
import { CourseCover } from './course-cover'
import { VISIBILITY_LABEL, type PathSummary, type PathVisibility } from '@/lib/learning-path-types'

export function PathsView({ paths, linked, onCreate }: {
  paths: PathSummary[]
  linked: boolean
  onCreate: () => void
}) {
  const mine = paths.filter((p) => p.mine)
  const shared = paths.filter((p) => !p.mine)

  return (
    <>
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">My Learning Paths</h1>
          <p className="text-sm text-slate-500 mt-1">Courses put in an order, to take one after another.</p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          disabled={!linked}
          className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Plus className="w-4 h-4" /> Create path
        </button>
      </div>

      {mine.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <FolderPlus className="w-6 h-6 text-slate-300 mx-auto" />
          <p className="text-sm text-slate-600 mt-3">You have not made a path yet.</p>
          <p className="text-xs text-slate-400 mt-1">
            Create one here, or use the ⋮ menu on any course and choose{' '}
            <span className="font-medium">Add to Learning Path</span>.
          </p>
        </div>
      ) : (
        <PathGrid paths={mine} />
      )}

      {shared.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg sm:text-xl font-semibold text-slate-900">Shared with everyone</h2>
          <PathGrid paths={shared} />
        </section>
      )}
    </>
  )
}

function PathGrid({ paths }: { paths: PathSummary[] }) {
  return (
    <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
      {paths.map((p) => (
        <Link
          key={p.id}
          href={`/dashboard/learning/paths/${p.id}`}
          className="group rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden"
        >
          <PathMosaic pathId={p.id} covers={p.covers} />
          <div className="p-4">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {p.visibility === 'EVERYONE' ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
              {VISIBILITY_LABEL[p.visibility as PathVisibility] ?? p.visibility}
            </span>
            <p className="font-semibold text-slate-900 mt-1 line-clamp-2 group-hover:underline">{p.title}</p>
            <p className="text-xs text-slate-500 mt-1">
              {p.items} item{p.items === 1 ? '' : 's'}
              {p.owner ? ` · by ${p.owner}` : ''}
            </p>
          </div>
        </Link>
      ))}
    </div>
  )
}

function PathMosaic({ pathId, covers }: { pathId: string; covers: PathSummary['covers'] }) {
  if (covers.length === 0) {
    return (
      <div className="h-32 bg-slate-100 flex items-center justify-center">
        <FolderPlus className="w-8 h-8 text-slate-300" />
      </div>
    )
  }
  // The path id goes into each cover's id: the same course can sit in two
  // paths on one page, and gradient ids are document-global.
  return (
    <div className="h-32 flex gap-0.5 bg-white">
      {covers.map((c) => (
        <CourseCover key={c.id} id={`${pathId}-${c.id}`} title={c.title} type={c.type} className="flex-1 h-full" />
      ))}
    </div>
  )
}

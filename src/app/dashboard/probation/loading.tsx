export default function ProbationListLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-6 text-white shadow-md">
        <div className="flex items-start gap-4 animate-pulse">
          <div className="rounded-xl bg-white/20 h-12 w-12" />
          <div className="flex-1 space-y-2">
            <div className="h-6 w-56 rounded bg-white/30" />
            <div className="h-3 w-80 rounded bg-white/20" />
          </div>
        </div>
      </div>

      {/* Tab skeletons */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-9 w-28 rounded-md bg-slate-200 animate-pulse" />
        ))}
      </div>

      {/* Table skeleton */}
      <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm bg-white">
        <div className="border-b border-slate-200 p-3 grid grid-cols-7 gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-3 rounded bg-slate-200 animate-pulse" />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, row) => (
          <div key={row} className="border-b border-slate-100 p-4 grid grid-cols-7 gap-3 items-center">
            <div className="space-y-2">
              <div className="h-3 w-28 rounded bg-slate-200 animate-pulse" />
              <div className="h-2 w-20 rounded bg-slate-100 animate-pulse" />
            </div>
            <div className="h-3 w-24 rounded bg-slate-200 animate-pulse" />
            <div className="h-3 w-20 rounded bg-slate-200 animate-pulse" />
            <div className="h-3 w-20 rounded bg-slate-200 animate-pulse" />
            <div className="h-3 w-16 rounded bg-slate-200 animate-pulse" />
            <div className="h-3 w-8 rounded bg-slate-200 animate-pulse" />
            <div className="h-3 w-12 rounded bg-slate-200 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}

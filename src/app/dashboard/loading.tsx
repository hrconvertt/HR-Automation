/**
 * Route-level skeleton for the dashboard segment — KPI-tile shaped placeholders
 * instead of a blank screen while the server component fetches.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-5 animate-pulse" aria-busy="true" aria-label="Loading dashboard">
      {/* Hero strip */}
      <div className="rounded-2xl bg-slate-100 h-28" />

      {/* KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="h-3 w-16 bg-slate-100 rounded" />
            <div className="h-6 w-10 bg-slate-100 rounded mt-3" />
          </div>
        ))}
      </div>

      {/* Two content panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="h-4 w-40 bg-slate-100 rounded" />
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="h-10 bg-slate-50 rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Route-level skeleton for Attendance — header, filter bar, and a
 * month-grid-shaped table (employee column + day cells).
 */
export default function AttendanceLoading() {
  return (
    <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="Loading attendance">
      {/* Title row */}
      <div className="space-y-2">
        <div className="h-7 w-56 bg-slate-100 rounded" />
        <div className="h-4 w-80 bg-slate-50 rounded" />
      </div>

      {/* View tabs */}
      <div className="h-9 w-56 bg-slate-100 rounded-lg" />

      {/* Filter bar */}
      <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 flex items-center gap-2">
        <div className="h-8 w-28 bg-slate-100 rounded-md" />
        <div className="h-8 w-36 bg-slate-100 rounded-md" />
        <div className="h-8 w-44 bg-slate-100 rounded-md" />
      </div>

      {/* Month grid */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {/* Header: day columns */}
        <div className="flex items-center gap-1 px-3 py-2 bg-slate-50 border-b border-slate-200">
          <div className="h-4 w-52 bg-slate-100 rounded flex-shrink-0" />
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="h-6 w-6 bg-slate-100 rounded hidden sm:block" />
          ))}
        </div>
        {/* Employee rows × day cells */}
        {Array.from({ length: 8 }).map((_, r) => (
          <div key={r} className="flex items-center gap-1 px-3 py-2 border-b border-slate-100">
            <div className="flex items-center gap-2 w-52 flex-shrink-0">
              <div className="w-7 h-7 rounded-full bg-slate-100" />
              <div className="h-3 w-28 bg-slate-100 rounded" />
            </div>
            {Array.from({ length: 20 }).map((_, c) => (
              <div key={c} className="h-6 w-6 bg-slate-50 rounded hidden sm:block" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

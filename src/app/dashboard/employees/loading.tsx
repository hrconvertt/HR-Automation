/**
 * Route-level skeleton for People — filter toolbar + employee card grid,
 * matching the shape of the HR/Manager card-grid views.
 */
export default function EmployeesLoading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading people">
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        {/* Toolbar: search + filters + actions */}
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap gap-3 items-center">
          <div className="h-9 flex-1 min-w-[200px] bg-slate-100 rounded-md" />
          <div className="h-9 w-40 bg-slate-100 rounded-md" />
          <div className="h-9 w-36 bg-slate-100 rounded-md" />
          <div className="h-9 w-36 bg-slate-100 rounded-md" />
          <div className="ml-auto h-9 w-32 bg-slate-100 rounded-md" />
        </div>
        {/* Card grid */}
        <div className="p-4 bg-slate-50/50">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-full bg-slate-100 flex-shrink-0" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-4 w-3/4 bg-slate-100 rounded" />
                    <div className="h-3 w-1/2 bg-slate-100 rounded" />
                    <div className="h-3 w-2/3 bg-slate-50 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

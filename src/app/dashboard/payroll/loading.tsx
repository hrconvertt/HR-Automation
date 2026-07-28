/**
 * Route-level skeleton for Payroll — banner, toolbar, summary tiles, and a
 * payslip-table shape.
 */
export default function PayrollLoading() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading payroll">
      {/* Banner */}
      <div className="rounded-2xl bg-slate-200 h-24" />

      {/* Toolbar: month/year picker + actions */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-9 w-32 bg-slate-100 rounded-md" />
        <div className="h-9 w-24 bg-slate-100 rounded-md" />
        <div className="ml-auto h-9 w-36 bg-slate-100 rounded-md" />
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="h-3 w-20 bg-slate-100 rounded" />
            <div className="h-6 w-24 bg-slate-100 rounded mt-3" />
          </div>
        ))}
      </div>

      {/* Payslip table: header + 8 rows */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex gap-4">
          {[40, 24, 20, 20, 20].map((w, i) => (
            <div key={i} className="h-4 bg-slate-100 rounded" style={{ width: `${w * 4}px` }} />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="px-4 py-3 border-b border-slate-100 flex gap-4 items-center">
            <div className="h-4 w-40 bg-slate-100 rounded" />
            <div className="h-4 w-24 bg-slate-50 rounded" />
            <div className="h-4 w-20 bg-slate-50 rounded" />
            <div className="h-4 w-20 bg-slate-50 rounded" />
            <div className="h-4 w-20 bg-slate-50 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

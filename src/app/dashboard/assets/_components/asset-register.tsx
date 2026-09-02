'use client'

/**
 * The asset register, with the depreciation worked out.
 *
 * The list on paper carries the figures but not the arithmetic — cost, life
 * and a purchase date, and then columns somebody has to keep in step by hand.
 * Every derived number here is computed from those three, so the register
 * cannot fall out of agreement with itself.
 *
 * Grouped by category and collapsible, because 48 rows across four categories
 * is a wall otherwise. Each category header carries its own totals, so the
 * question "what are the electronics worth now" is answered without opening
 * anything.
 */
import { Fragment, useMemo, useState } from 'react'
import { depreciate, registerTotals } from '@/lib/asset-depreciation'

export interface RegisterAsset {
  id: string
  assetCode: string | null
  category: string | null
  subCategory: string | null
  name: string
  quantity: number
  brand: string | null
  modelSerialNumber: string | null
  locationLabel: string | null
  custodyType: string
  status: string
  estimatedLifeYears: number | null
  purchasePricePkr: number | null
  currentMarketValue: number | null
  residualValue: number | null
  purchaseDate: string | null
  photoUrl: string | null
  notes: string | null
}

const pkr = (n: number | null | undefined) =>
  n == null ? '—' : 'PKR ' + Math.round(n).toLocaleString('en-PK')
const num = (n: number | null | undefined, dp = 0) =>
  n == null ? '—' : n.toFixed(dp)
const day = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—'

export function AssetRegister({ assets }: { assets: RegisterAsset[] }) {
  const [open, setOpen] = useState<string | null>(null)
  const [detail, setDetail] = useState<string | null>(null)

  const asOf = useMemo(() => new Date(), [])
  const today = asOf.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const totals = useMemo(() => registerTotals(assets, asOf), [assets, asOf])

  const groups = useMemo(() => {
    const by = new Map<string, RegisterAsset[]>()
    for (const a of assets) {
      const k = a.category ?? 'Uncategorised'
      by.set(k, [...(by.get(k) ?? []), a])
    }
    return [...by.entries()]
      .map(([category, rows]) => ({ category, rows, totals: registerTotals(rows, asOf) }))
      .sort((a, b) => b.totals.cost - a.totals.cost)
  }, [assets, asOf])

  if (assets.length === 0) return null

  return (
    <div className="space-y-4">
      {/* What the register is worth, before anything is opened. */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Stat label="Assets" value={String(totals.count)} sub={`${totals.units} units`} />
        <Stat label="Purchase cost" value={pkr(totals.cost)} sub="what it all cost" />
        <Stat label="Written off" value={pkr(totals.accumulated)} sub="depreciation to date" />
        <Stat label="Book value" value={pkr(totals.book)} sub="cost less depreciation" />
        <Stat label="Past its life" value={String(totals.expired)}
          sub={totals.undated ? `${totals.undated} with no date` : 'estimated life used up'} />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">
            Asset register · {totals.count} across {groups.length} categories
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Straight-line from the purchase price down to the residual value over the estimated
            life, as at{" "}
            <strong className="text-slate-700">
              {asOf.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}
            </strong>
            . Every figure is worked from cost, life and purchase date — nothing is typed in twice,
            so the columns cannot fall out of step the way they do on a sheet. Click a category to
            open it, then a row for the working in words.
          </p>
        </div>

        <div className="divide-y divide-slate-100">
          {groups.map((g) => (
            <details key={g.category} className="group" open={open === g.category}
              onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open ? g.category : null)}>
              <summary className="flex items-baseline gap-2 px-4 py-2 cursor-pointer list-none hover:bg-slate-50/70 [&::-webkit-details-marker]:hidden">
                <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden
                  className="w-3 h-3 shrink-0 self-center text-slate-400 transition-transform group-open:rotate-90">
                  <path d="M7 5l6 5-6 5V5z" />
                </svg>
                <span className="text-[13px] font-semibold text-slate-800">{g.category}</span>
                <span className="text-[11px] text-slate-400">
                  {g.totals.count} {g.totals.count === 1 ? 'asset' : 'assets'} · {g.totals.units} units
                </span>
                <span className="flex-1 border-b border-dotted border-slate-200" />
                <span className="text-[11px] text-slate-500 tabular-nums whitespace-nowrap">
                  cost {pkr(g.totals.cost)}
                  <span className="text-slate-900 font-medium ml-3">now {pkr(g.totals.book)}</span>
                </span>
              </summary>

              <div className="overflow-x-auto pb-1">
                <table className="w-full text-sm min-w-[1850px]">
                  <thead>
                    <tr className="bg-slate-50/70 border-y border-slate-100">
                      <Th>Item</Th>
                      <Th right>Qty</Th>
                      <Th>Where / who</Th>
                      <Th>Purchased</Th>
                      <Th>Current<br /><span className="font-normal normal-case text-slate-400">date</span></Th>
                      <Th right>Cost</Th>
                      <Th right>Residual<br /><span className="font-normal normal-case text-slate-400">cost x 50%</span></Th>
                      <Th right>Life<br /><span className="font-normal normal-case text-slate-400">years</span></Th>
                      <Th right>Depreciation<br /><span className="font-normal normal-case text-slate-400">per year</span></Th>
                      <Th right>After 1 yr</Th>
                      <Th right>Total<br /><span className="font-normal normal-case text-slate-400">months</span></Th>
                      <Th right>Elapsed</Th>
                      <Th right>Left</Th>
                      <Th right>Years<br /><span className="font-normal normal-case text-slate-400">left</span></Th>
                      <Th right>Written off</Th>
                      <Th right>Book value</Th>
                      <Th>Life used</Th>
                      <Th>Photo</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((a) => {
                      const d = depreciate(a, asOf)
                      const isOpen = detail === a.id
                      return (
                        <Fragment key={a.id}>
                          <tr
                            onClick={() => setDetail(isOpen ? null : a.id)}
                            className={`border-b border-slate-50 cursor-pointer hover:bg-slate-50/60 ${isOpen ? 'bg-slate-50/80' : ''}`}>
                            <td className="pl-9 pr-3 py-1.5">
                              <span className="text-slate-900">{a.subCategory ?? a.name}</span>
                              {a.assetCode && (
                                <span className="ml-2 text-[10px] font-mono text-slate-400">{a.assetCode}</span>
                              )}
                              <span className="block text-[11px] text-slate-400 truncate max-w-[16rem]">
                                {[a.name !== a.subCategory ? a.name : null, a.modelSerialNumber]
                                  .filter(Boolean).join(' · ') || ' '}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{a.quantity}</td>
                            <td className="px-3 py-1.5 text-[11px] text-slate-500 whitespace-nowrap">
                              {a.locationLabel ?? '—'}
                              <span className="block text-slate-400">{a.custodyType.toLowerCase()}</span>
                            </td>
                            <td className="px-3 py-1.5 text-[11px] text-slate-500 whitespace-nowrap tabular-nums">{day(a.purchaseDate)}</td>
                            <td className="px-3 py-1.5 text-[11px] text-slate-400 whitespace-nowrap tabular-nums">{today}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-600 whitespace-nowrap">{pkr(d.cost)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-500 whitespace-nowrap">{pkr(d.residual)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-400 whitespace-nowrap">
                              {d.lifeYears != null ? num(d.lifeYears) : '—'}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-500 whitespace-nowrap">{pkr(d.annual)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-400 whitespace-nowrap">{pkr(d.valueAfterOneYear)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{d.totalMonths ?? '—'}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{d.monthsElapsed ?? '—'}</td>
                            <td className={`px-3 py-1.5 text-right tabular-nums whitespace-nowrap ${d.expired ? 'text-amber-800 font-medium' : 'text-slate-600'}`}>
                              {d.monthsLeft != null ? d.monthsLeft : '—'}
                            </td>
                            <td className={`px-3 py-1.5 text-right tabular-nums whitespace-nowrap ${d.expired ? 'text-amber-800' : 'text-slate-600'}`}>
                              {d.yearsLeft != null ? num(d.yearsLeft, 1) : '—'}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-rose-700 whitespace-nowrap">
                              {d.accumulated != null ? '−' + pkr(d.accumulated).replace('PKR ', '') : '—'}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums font-medium text-slate-900 whitespace-nowrap">{pkr(d.bookValue)}</td>
                            <td className="px-3 py-1.5 w-28">
                              {d.lifeUsed != null ? (
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                    <div className={`h-full ${d.expired ? 'bg-amber-500' : 'bg-slate-700'}`}
                                      style={{ width: `${Math.round(d.lifeUsed * 100)}%` }} />
                                  </div>
                                  <span className="text-[10px] text-slate-400 tabular-nums w-8 text-right">
                                    {Math.round(d.lifeUsed * 100)}%
                                  </span>
                                </div>
                              ) : <span className="text-[11px] text-slate-300">no date</span>}
                            </td>
                            <td className="px-3 py-1.5">
                              {a.photoUrl ? (
                                <a href={a.photoUrl} target="_blank" rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-[11px] text-slate-600 underline hover:text-slate-900">
                                  view
                                </a>
                              ) : <span className="text-[11px] text-slate-300">—</span>}
                            </td>
                          </tr>

                          {isOpen && (
                            <tr className="bg-slate-50/80 border-b border-slate-100">
                              <td colSpan={18} className="px-9 py-3">
                                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-3">
                                  <Cell label="Purchase price" value={pkr(d.cost)} />
                                  <Cell label="Residual (50%)" value={pkr(d.residual)} />
                                  <Cell label="Depreciable" value={
                                    d.cost != null && d.residual != null ? pkr(d.cost - d.residual) : '—'} />
                                  <Cell label="Per year" value={pkr(d.annual)} />
                                  <Cell label="Per month" value={pkr(d.monthly)} />
                                  <Cell label="After one year" value={pkr(d.valueAfterOneYear)} />
                                  <Cell label="Purchased" value={day(a.purchaseDate)} />
                                  <Cell label="Total months" value={d.totalMonths != null ? String(d.totalMonths) : '—'} />
                                  <Cell label="Months elapsed" value={d.monthsElapsed != null ? String(d.monthsElapsed) : '—'} />
                                  <Cell label="Months left" value={d.monthsLeft != null ? String(d.monthsLeft) : '—'} />
                                  <Cell label="Years left" value={d.yearsLeft != null ? num(d.yearsLeft, 1) : '—'} />
                                  <Cell label="Book value now" value={pkr(d.bookValue)} strong />
                                  {a.currentMarketValue != null && (
                                    <Cell label="Market value on the list" value={pkr(a.currentMarketValue)} />
                                  )}
                                  {a.brand && <Cell label="Make" value={a.brand} />}
                                  {a.modelSerialNumber && <Cell label="Model / serial" value={a.modelSerialNumber} />}
                                  <Cell label="Status" value={a.status} />
                                </div>
                                {d.cost != null && d.residual != null && d.annual != null && (
                                  <p className="text-[11px] text-slate-500 mt-3">
                                    {pkr(d.cost)} less a residual of {pkr(d.residual)} leaves{' '}
                                    {pkr(d.cost - d.residual)} to write off over {num(d.lifeYears)} years —{' '}
                                    {pkr(d.annual)} a year, {pkr(d.monthly)} a month.
                                    {d.monthsElapsed != null && (
                                      <> {d.monthsElapsed} months have passed, so {pkr(d.accumulated)} is
                                      written off and it stands at {pkr(d.bookValue)}
                                      {d.expired ? ' — past its estimated life.' : '.'}</>
                                    )}
                                  </p>
                                )}
                                {a.photoUrl && (
                                  <a href={a.photoUrl} target="_blank" rel="noreferrer"
                                    className="inline-block text-[11px] text-slate-600 hover:text-slate-900 underline mt-2">
                                    Photo
                                  </a>
                                )}
                                {a.notes && <p className="text-[11px] text-slate-400 mt-2">{a.notes}</p>}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                    <tr className="bg-slate-50/70">
                      <td colSpan={5} className="px-4 py-2 text-right text-[13px] font-semibold text-slate-700">
                        {g.category} total
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold whitespace-nowrap">{pkr(g.totals.cost)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-500 whitespace-nowrap">{pkr(g.totals.residual)}</td>
                      <td colSpan={6} />
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-rose-700 whitespace-nowrap">
                        −{pkr(g.totals.accumulated).replace('PKR ', '')}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold whitespace-nowrap">{pkr(g.totals.book)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>

        <p className="px-4 py-2.5 text-[11px] text-slate-400 border-t border-slate-100">
          Residual value is half the purchase price, as the Asset Management List sets it, so an
          asset writes off 50% of its cost across its estimated life and keeps the rest. Book value
          never falls below the residual. Rows with no purchase date or no estimated life show the
          figures that can be worked out and leave the rest blank.
        </p>
      </div>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-lg font-bold text-slate-900 mt-1 tabular-nums">{value}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>
    </div>
  )
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-2 text-[11px] uppercase tracking-wider text-slate-500 font-semibold whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

function Cell({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{label}</p>
      <p className={`tabular-nums ${strong ? 'text-sm font-bold text-slate-900' : 'text-[13px] text-slate-700'}`}>
        {value}
      </p>
    </div>
  )
}

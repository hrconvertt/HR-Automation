/**
 * What an asset is worth now, and how much life it has left.
 *
 * Straight-line depreciation from the purchase price down to the residual
 * value over the estimated life, which is what the Asset Management List
 * works to: residual is half the cost, so an asset writes off 50% of its
 * price across its life and keeps the other half.
 *
 *   annual depreciation = (cost − residual) / life
 *   book value          = cost − annual × years elapsed, floored at residual
 *
 * The sheet's "Depreciation per year" column is the book value after one
 * year rather than the amount written off — for a 104,000 asset over six
 * years it prints 95,333, which is 104,000 less one year of 8,667. Both are
 * given below under their own names, because a column labelled depreciation
 * that holds a book value is exactly the sort of thing that gets added into
 * the wrong total.
 *
 * Everything is guarded: the register has rows with no life, no price and no
 * purchase date, and a register that throws on its own data is no use.
 */

export interface AssetLike {
  purchasePricePkr?: number | null
  value?: number | null
  residualValue?: number | null
  estimatedLifeYears?: number | null
  purchaseDate?: Date | string | null
  quantity?: number | null
}

export interface Depreciation {
  cost: number | null
  residual: number | null
  lifeYears: number | null
  /** Amount written off each year. */
  annual: number | null
  monthly: number | null
  /** The sheet's column: what it is worth after one year. */
  valueAfterOneYear: number | null
  totalMonths: number | null
  monthsElapsed: number | null
  monthsLeft: number | null
  yearsLeft: number | null
  /** Written off so far, capped at the depreciable amount. */
  accumulated: number | null
  /** Cost less accumulated depreciation, floored at the residual value. */
  bookValue: number | null
  /** 0–1, how much of the estimated life has been used. */
  lifeUsed: number | null
  /** True once the estimated life has run out. */
  expired: boolean
}

function monthsBetween(from: Date, to: Date): number {
  return (to.getUTCFullYear() - from.getUTCFullYear()) * 12
    + (to.getUTCMonth() - from.getUTCMonth())
    + (to.getUTCDate() >= from.getUTCDate() ? 0 : -1)
}

export function depreciate(a: AssetLike, asOf: Date = new Date()): Depreciation {
  const cost = a.purchasePricePkr ?? a.value ?? null
  const lifeYears = a.estimatedLifeYears && a.estimatedLifeYears > 0 ? a.estimatedLifeYears : null
  // The register sets residual at half of cost. Fall back to that when a row
  // has a price and a life but no residual of its own.
  const residual = a.residualValue ?? (cost != null ? Math.round(cost * 0.5) : null)

  const purchase = a.purchaseDate
    ? (a.purchaseDate instanceof Date ? a.purchaseDate : new Date(a.purchaseDate))
    : null
  const valid = purchase && !Number.isNaN(purchase.getTime()) ? purchase : null

  const depreciable = cost != null && residual != null ? Math.max(0, cost - residual) : null
  const annual = depreciable != null && lifeYears ? depreciable / lifeYears : null
  const monthly = annual != null ? annual / 12 : null

  const totalMonths = lifeYears != null ? Math.round(lifeYears * 12) : null
  const monthsElapsed = valid ? Math.max(0, monthsBetween(valid, asOf)) : null
  const monthsLeft = totalMonths != null && monthsElapsed != null
    ? totalMonths - monthsElapsed : null
  const yearsLeft = monthsLeft != null ? monthsLeft / 12 : null

  const accumulated = monthly != null && monthsElapsed != null && depreciable != null
    ? Math.min(depreciable, monthly * monthsElapsed)
    : null
  const bookValue = cost != null && accumulated != null
    ? Math.max(residual ?? 0, cost - accumulated)
    : cost

  return {
    cost, residual, lifeYears, annual, monthly,
    valueAfterOneYear: cost != null && annual != null ? cost - annual : null,
    totalMonths, monthsElapsed, monthsLeft, yearsLeft,
    accumulated, bookValue,
    lifeUsed: totalMonths && monthsElapsed != null
      ? Math.min(1, monthsElapsed / totalMonths) : null,
    expired: monthsLeft != null && monthsLeft <= 0,
  }
}

/** Register-wide totals, quantity taken into account where it is set. */
export function registerTotals(assets: AssetLike[], asOf: Date = new Date()) {
  let cost = 0, book = 0, accumulated = 0, residual = 0, units = 0, expired = 0, undated = 0
  for (const a of assets) {
    const d = depreciate(a, asOf)
    units += a.quantity ?? 1
    if (d.cost != null) cost += d.cost
    if (d.bookValue != null) book += d.bookValue
    if (d.accumulated != null) accumulated += d.accumulated
    if (d.residual != null) residual += d.residual
    if (d.expired) expired++
    if (d.monthsElapsed == null) undated++
  }
  return { cost, book, accumulated, residual, units, expired, undated, count: assets.length }
}

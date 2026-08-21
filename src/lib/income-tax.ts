/**
 * FBR salaried income-tax calculation from editable slabs.
 *
 * The slabs live in the `tax_slabs` table (one row per bracket per year) so the
 * Finance Act's yearly revisions are a data change, never a code change. This
 * module is pure — hand it the slabs and an annual taxable income and it returns
 * the tax; it does not touch the database.
 */

export interface TaxSlabRow {
  id?: string
  taxYear: string
  incomeFrom: number
  incomeTo: number | null
  ratePercent: number
  fixedAmount: number
  orderIndex?: number
}

/** The current Pakistan tax year label, e.g. "2025-26". Runs Jul–Jun. */
export function currentTaxYear(now = new Date()): string {
  const y = now.getUTCFullYear()
  const startYear = now.getUTCMonth() >= 6 ? y : y - 1 // July = month 6
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
}

/**
 * Annual income tax for a taxable salary, given that year's slabs.
 * Picks the bracket the income falls in and applies:
 *   fixedAmount + ratePercent% × (income − incomeFrom).
 */
export function annualIncomeTax(annualTaxable: number, slabs: TaxSlabRow[]): number {
  if (annualTaxable <= 0 || slabs.length === 0) return 0
  const sorted = [...slabs].sort((a, b) => a.incomeFrom - b.incomeFrom)
  let slab = sorted[0]
  for (const s of sorted) {
    if (annualTaxable > s.incomeFrom) slab = s
    else break
  }
  const tax = slab.fixedAmount + (slab.ratePercent / 100) * (annualTaxable - slab.incomeFrom)
  return Math.max(0, Math.round(tax))
}

/** Monthly withholding = annual tax / 12. */
export function monthlyWithholding(annualTaxable: number, slabs: TaxSlabRow[]): number {
  return Math.round(annualIncomeTax(annualTaxable, slabs) / 12)
}

export const FILER_STATUSES = [
  { value: 'filer', label: 'Filer (on ATL)' },
  { value: 'late_filer', label: 'Late filer' },
  { value: 'non_filer', label: 'Non-filer' },
] as const

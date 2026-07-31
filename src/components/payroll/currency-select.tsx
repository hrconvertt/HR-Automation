'use client'

/**
 * Currency selector for payroll tables.
 *
 * The unit belongs in the column heading, not repeated in every cell — a table
 * with twenty money columns printed "PKR" twenty times per row and forced the
 * figures to wrap onto two lines.
 *
 * IMPORTANT: this changes the DISPLAY UNIT ONLY. No amount is converted — the
 * app holds no exchange rates, and silently re-labelling PKR figures as USD
 * would misstate payroll. Switch this only when the underlying figures really
 * are in the selected currency (Convertt payroll is PKR; LinkedIn job-posting
 * spend is billed in AED).
 */

export const CURRENCIES = [
  { code: 'PKR', label: 'PKR — Pakistani Rupee', locale: 'en-PK' },
  { code: 'AED', label: 'AED — UAE Dirham', locale: 'en-AE' },
  { code: 'USD', label: 'USD — US Dollar', locale: 'en-US' },
  { code: 'GBP', label: 'GBP — Pound Sterling', locale: 'en-GB' },
  { code: 'EUR', label: 'EUR — Euro', locale: 'en-IE' },
  { code: 'SAR', label: 'SAR — Saudi Riyal', locale: 'en-SA' },
] as const

export type CurrencyCode = (typeof CURRENCIES)[number]['code']

const localeFor = (code: CurrencyCode) =>
  CURRENCIES.find((c) => c.code === code)?.locale ?? 'en-PK'

/** Grouped number with no currency prefix — the heading carries the unit. */
export function formatAmount(value: number, code: CurrencyCode, decimals = 0): string {
  return value.toLocaleString(localeFor(code), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function CurrencySelect({
  value,
  onChange,
  className = '',
}: {
  value: CurrencyCode
  onChange: (code: CurrencyCode) => void
  className?: string
}) {
  return (
    <label className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="text-[10px] uppercase tracking-wide text-slate-500">Currency</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as CurrencyCode)}
        aria-label="Display currency for all amounts in this table"
        title="Display unit only — amounts are not converted"
        className="text-xs font-semibold px-2 py-1 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-700"
      >
        {CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>{c.code}</option>
        ))}
      </select>
    </label>
  )
}

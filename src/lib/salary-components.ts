/**
 * Salary component vocabulary — shared by the API and the settings UI.
 *
 * Section 1 of the Pakistan payroll build: the org-level template of what a
 * salary is made of. Every rate lives on a row and is editable; nothing here is
 * a hardcoded pay constant.
 */

export const COMPONENT_TYPES = ['earning', 'deduction'] as const
export type ComponentType = (typeof COMPONENT_TYPES)[number]
export const COMPONENT_TYPE_LABELS: Record<ComponentType, string> = {
  earning: 'Earning',
  deduction: 'Deduction',
}

export const CALCULATION_BASES = ['fixed_amount', 'percent_of_basic', 'percent_of_gross'] as const
export type CalculationBasis = (typeof CALCULATION_BASES)[number]
export const CALCULATION_BASIS_LABELS: Record<CalculationBasis, string> = {
  fixed_amount: 'Fixed amount (PKR)',
  percent_of_basic: '% of Basic',
  percent_of_gross: '% of Gross',
}

/** How the default value reads for a given basis. */
export function formatValue(basis: string, value: number): string {
  return basis === 'fixed_amount'
    ? `PKR ${value.toLocaleString('en-PK')}`
    : `${value}%`
}

export interface SalaryComponentRow {
  id: string
  name: string
  type: string
  calculationBasis: string
  defaultValue: number
  isStatutory: boolean
  isTaxable: boolean
  active: boolean
  orderIndex: number
}

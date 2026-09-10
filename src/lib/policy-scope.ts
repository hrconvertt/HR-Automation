/**
 * Which rules apply to this person, on this date.
 *
 * Convertt employs through two companies under one brand — Convertt (Lahore)
 * and SyeDev LLC FZ (Dubai) — and the Playbook's entitlements live in Country
 * Annexes, where "if anything in the Global Core conflicts with a Country
 * Annex, the Annex and the law prevail". The app had no idea either existed:
 * `Employee.country` was a column referenced nowhere, `Salary` had no
 * currency, and every leave entitlement was one unscoped row.
 *
 * This is the smallest honest version of how Workday does it. Workday does not
 * branch on country in code; it resolves a plan by *eligibility* against
 * worker attributes, so a new country is new rows rather than new
 * if-statements. Same idea here: ask for the policy that applies to a worker
 * at a date, and let the data answer.
 *
 * Two separate questions, deliberately kept apart:
 *   country — whose employment law and entitlements apply
 *   entity  — which company signs the contract and pays
 * They line up today. They need not: a Pakistani national employed by the
 * Dubai entity is governed by UAE rules, and the day that happens the column
 * that matters is the country, not the letterhead.
 */
import { prisma } from '@/lib/prisma'

export type CountryCode = 'PK' | 'AE'

/** Where an employee has no country recorded, everything so far has been PK. */
export const DEFAULT_COUNTRY: CountryCode = 'PK'

/**
 * The date every rule that predates versioning is treated as having applied
 * from. Rows written before `effectiveFrom` existed all carry it.
 */
export const BASE_EFFECTIVE_FROM = new Date('2020-01-01T00:00:00Z')

export const COUNTRY_LABEL: Record<CountryCode, string> = {
  PK: 'Pakistan',
  AE: 'United Arab Emirates',
}

export const COUNTRY_CURRENCY: Record<CountryCode, string> = {
  PK: 'PKR',
  AE: 'AED',
}

export function asCountry(v: string | null | undefined): CountryCode {
  return v === 'AE' ? 'AE' : DEFAULT_COUNTRY
}

/** The country whose rules govern this employee. */
export async function countryFor(employeeId: string): Promise<CountryCode> {
  const e = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { country: true, legalEntity: { select: { country: true } } },
  })
  // The worker's own country wins; the employing entity is the fallback for
  // records that predate the column.
  return asCountry(e?.country ?? e?.legalEntity?.country)
}

export interface ResolvedLeavePolicy {
  leaveType: string
  daysPerYear: number
  accrualPerMonth: number | null
  carryForward: boolean
  maxCarryDays: number
  effectiveFrom: Date
}

/**
 * The leave entitlements in force for a country and employee type on a date.
 *
 * Policy is versioned rather than edited: rows carry `effectiveFrom`, and the
 * newest row on or before the date wins. That is what stops a change to this
 * year's scheme from silently rewriting what last year's leave actually was —
 * the same reason Workday effective-dates everything and treats a change as a
 * new version rather than an overwrite.
 */
export async function leavePolicyFor(
  country: CountryCode,
  employeeType: string,
  on: Date = new Date(),
): Promise<ResolvedLeavePolicy[]> {
  const rows = await prisma.leavePolicy.findMany({
    where: { country, employeeType, effectiveFrom: { lte: on } },
    orderBy: [{ leaveType: 'asc' }, { effectiveFrom: 'desc' }],
    select: {
      leaveType: true, daysPerYear: true, accrualPerMonth: true,
      carryForward: true, maxCarryDays: true, effectiveFrom: true,
    },
  })
  // One row per leave type — the first of each is the newest still in force.
  const seen = new Set<string>()
  const out: ResolvedLeavePolicy[] = []
  for (const r of rows) {
    if (seen.has(r.leaveType)) continue
    seen.add(r.leaveType)
    out.push(r)
  }
  return out
}

/** The same, for one employee, without the caller having to know their country. */
export async function leavePolicyForEmployee(
  employeeId: string, employeeType: string, on: Date = new Date(),
): Promise<ResolvedLeavePolicy[]> {
  return leavePolicyFor(await countryFor(employeeId), employeeType, on)
}

/** The entity a contract, offer letter or NDA must name. */
export async function employingEntity(employeeId: string) {
  const e = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { legalEntity: true },
  })
  if (e?.legalEntity) return e.legalEntity
  return prisma.legalEntity.findFirst({ where: { isDefault: true } })
}

/** What this employee is paid in. Falls back to their country's currency. */
export async function payCurrencyFor(employeeId: string): Promise<string> {
  const s = await prisma.salary.findFirst({
    where: { employeeId }, select: { currency: true },
    orderBy: { createdAt: 'desc' },
  })
  if (s?.currency) return s.currency
  return COUNTRY_CURRENCY[await countryFor(employeeId)]
}

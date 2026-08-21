/**
 * Settings → Salary Structure (Payroll section 1).
 *
 * The org-level template: what share of gross is Basic by default, and the
 * library of earnings and deductions a salary is built from. This is the
 * template; putting a structure on a specific employee comes in a later phase.
 *
 * HR only.
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { SalaryStructureClient } from './salary-structure-client'

export default async function SalaryStructurePage() {
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')
  const role = cookieStore.get('hr_preview_role')?.value ?? payload.role
  if (role !== 'HR_ADMIN') {
    return (
      <div className="rounded-2xl bg-slate-50 border border-slate-100 p-6">
        <h2 className="text-lg font-semibold text-slate-900">Access denied</h2>
        <p className="text-sm text-slate-600 mt-2">Salary structure is HR-only.</p>
      </div>
    )
  }

  const [components, basicCfg] = await Promise.all([
    prisma.salaryComponent.findMany({ orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }] }),
    prisma.config.findUnique({ where: { key: 'salaryStructure:basicPctOfGross' } }),
  ])

  return (
    <SalaryStructureClient
      basicPctOfGross={basicCfg ? Number(basicCfg.value) : 60}
      components={components.map((c) => ({
        id: c.id, name: c.name, type: c.type, calculationBasis: c.calculationBasis,
        defaultValue: c.defaultValue, isStatutory: c.isStatutory, isTaxable: c.isTaxable,
        active: c.active, orderIndex: c.orderIndex,
      }))}
    />
  )
}
